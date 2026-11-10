// Keyless Edge read-aloud, run from the Worker so the browser can use it.
//
// The browser cannot speak to Microsoft's endpoint directly: the handshake
// needs headers a page may not set (Origin, User-Agent, cookies) and the audio
// arrives over a WebSocket that carries no credentials. Cloudflare Workers can
// open that socket, so the Worker relays one utterance and answers the browser
// with a normal audio/mpeg body.
import type { EdgeTtsRequest } from "@gys/contracts";
import {
  EDGE_TRUSTED_CLIENT_TOKEN,
  SEC_MS_GEC_VERSION_PREFIX,
  generateSecMsGecV2,
} from "./edge-ms-gec.js";

export const EDGE_RELAY_TIMEOUT_MS = 20_000;
export const EDGE_RELAY_MAX_BYTES = 10 * 1024 * 1024;
// A recent Edge build. Bump from
// https://edgeupdates.microsoft.com/api/products?view=enterprise when the
// handshake starts answering 403 again.
const SEC_MS_GEC_VERSION = `${SEC_MS_GEC_VERSION_PREFIX}-158.0.4357.0`;
// A Worker opens the socket through fetch with the Upgrade header; a wss:
// URL is rejected by the Worker runtime, so this stays https:.
const ENDPOINT =
  "https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/158.0.0.0 Safari/537.36 Edg/158.0.0.0";

// --- speech ---------------------------------------------------------------

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function percent(value: number): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}%`;
}

export function buildEdgeSsml(request: EdgeTtsRequest): string {
  return [
    "<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>",
    `<voice name='${request.voice}'>`,
    `<prosody rate='${percent((request.rate - 1) * 100)}' pitch='${percent((request.pitch - 1) * 50)}' volume='${percent((request.volume - 1) * 100)}'>`,
    escapeSsml(request.text),
    "</prosody></voice></speak>",
  ].join("");
}

export interface EdgeSocket {
  send(data: string): void;
  close(): void;
  onMessage(listener: (data: string | ArrayBuffer) => void): void;
  onClose(listener: (reason?: string) => void): void;
}

/** Reads the `<n>` framed binary packets: 2-byte header length, JSON, audio. */
export function edgeAudioChunk(data: ArrayBuffer): Uint8Array | undefined {
  const bytes = new Uint8Array(data);
  if (bytes.length < 2) return undefined;
  const headerLength = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  if (bytes.length < 2 + headerLength) return undefined;
  return bytes.subarray(2 + headerLength);
}

export function edgeRequestId(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 16), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function collectEdgeAudio(
  socket: EdgeSocket,
  request: EdgeTtsRequest,
  options: { nowMs?: number; timeoutMs?: number } = {},
): Promise<ArrayBuffer> {
  const nowMs = options.nowMs ?? Date.now();
  const requestId = edgeRequestId(crypto.getRandomValues(new Uint8Array(16)));
  const timestamp = new Date(nowMs).toISOString().replace(/\.\d{3}Z$/, "Z");
  const chunks: Uint8Array[] = [];
  let total = 0;
  return await new Promise<ArrayBuffer>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("Edge speech timed out")),
      options.timeoutMs ?? EDGE_RELAY_TIMEOUT_MS,
    );
    const settle = (error?: Error) => {
      clearTimeout(timer);
      socket.close();
      if (error) {
        reject(error);
        return;
      }
      if (!total) {
        reject(new Error("Edge speech returned no audio"));
        return;
      }
      const audio = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        audio.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(audio.buffer as ArrayBuffer);
    };
    socket.onClose((reason) =>
      settle(new Error(reason || "Edge speech closed")),
    );
    socket.onMessage((data) => {
      if (typeof data === "string") {
        if (data.includes("Path:turn.end")) settle();
        return;
      }
      const chunk = edgeAudioChunk(data);
      if (!chunk?.length) return;
      chunks.push(chunk);
      total += chunk.byteLength;
      if (total > EDGE_RELAY_MAX_BYTES)
        settle(new Error("Edge speech is too large"));
    });
    socket.send(
      [
        `X-Timestamp:${timestamp}`,
        "Content-Type:application/json; charset=utf-8",
        "Path:speech.config",
        "",
        JSON.stringify({
          context: {
            synthesis: {
              audio: {
                metadataoptions: {
                  sentenceBoundaryEnabled: "false",
                  wordBoundaryEnabled: "false",
                },
                outputFormat: "audio-24khz-48kbitrate-mono-mp3",
              },
            },
          },
        }),
      ].join("\r\n"),
    );
    socket.send(
      [
        `X-RequestId:${requestId}`,
        "Content-Type:application/ssml+xml",
        `X-Timestamp:${timestamp}`,
        "Path:ssml",
        "",
        buildEdgeSsml(request),
      ].join("\r\n"),
    );
  });
}

export async function connectEdgeSocket(
  options: { nowMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<EdgeSocket> {
  const nowMs = options.nowMs ?? Date.now();
  const url = new URL(ENDPOINT);
  url.searchParams.set("TrustedClientToken", EDGE_TRUSTED_CLIENT_TOKEN);
  url.searchParams.set("Sec-MS-GEC", generateSecMsGecV2(nowMs));
  url.searchParams.set("Sec-MS-GEC-Version", SEC_MS_GEC_VERSION);
  url.searchParams.set(
    "ConnectionId",
    edgeRequestId(crypto.getRandomValues(new Uint8Array(16))),
  );
  const response = await (options.fetchImpl ?? fetch)(url.toString(), {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      "Sec-WebSocket-Version": "13",
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
      Accept: "*/*",
      Origin: ORIGIN,
      "User-Agent": USER_AGENT,
    },
  });
  const socket = response.webSocket;
  if (!socket) throw new Error(`Edge handshake failed with ${response.status}`);
  socket.accept();
  const listeners: ((data: string | ArrayBuffer) => void)[] = [];
  const closes: ((reason?: string) => void)[] = [];
  socket.addEventListener("message", (event) => {
    for (const listener of listeners)
      listener(event.data as string | ArrayBuffer);
  });
  socket.addEventListener("close", (event) => {
    for (const listener of closes)
      listener(
        event.reason || event.code
          ? String(event.reason || event.code)
          : undefined,
      );
  });
  return {
    send: (data) => socket.send(data),
    close: () => socket.close(),
    onMessage: (listener) => listeners.push(listener),
    onClose: (listener) => closes.push(listener),
  };
}

export async function synthesizeEdgeSpeech(
  request: EdgeTtsRequest,
  deps: {
    nowMs?: number;
    fetchImpl?: typeof fetch;
    connect?: (options: { nowMs?: number }) => Promise<EdgeSocket>;
  } = {},
): Promise<ArrayBuffer> {
  const nowMs = deps.nowMs ?? Date.now();
  const socket = await (deps.connect ?? connectEdgeSocket)({ nowMs });
  return collectEdgeAudio(socket, request, { nowMs });
}
