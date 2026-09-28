import type TauriWebSocket from "@tauri-apps/plugin-websocket";
import type { Message as TauriWebSocketMessage } from "@tauri-apps/plugin-websocket";

type EdgeDirectRequest = {
  text: string;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
};

export type EdgeSocketMessage =
  | { type: "Text"; data: string }
  | { type: "Binary"; data: number[] }
  | { type: "Ping" | "Pong"; data: number[] }
  | { type: "Close"; data: unknown }
  | { type: "Error"; data: unknown };

export interface EdgeSocket {
  addListener(listener: (message: EdgeSocketMessage) => void): () => void;
  send(message: string | number[]): Promise<void>;
  disconnect(): Promise<void>;
}

type EdgeSocketConnect = (
  url: string,
  config?: {
    headers?: Record<string, string>;
    maxMessageSize?: number;
    maxFrameSize?: number;
  },
) => Promise<EdgeSocket>;

type EdgeDirectDependencies = {
  connect?: EdgeSocketConnect;
  now?: () => number;
  randomId?: () => string;
};

function edgeDiagnostic(
  level: "info" | "warn" | "error",
  scope: string,
  message: unknown,
): void {
  if (typeof window === "undefined") return;
  void import("./diagnostics.js").then(({ recordDiagnostic }) =>
    recordDiagnostic(level, scope, message),
  );
}

export class TauriEdgeSocketAdapter implements EdgeSocket {
  private readonly listeners = new Set<(message: EdgeSocketMessage) => void>();
  private readonly socket: Pick<
    TauriWebSocket,
    "addListener" | "send" | "disconnect"
  >;

  public constructor(
    socket: Pick<TauriWebSocket, "addListener" | "send" | "disconnect">,
  ) {
    this.socket = socket;
  }

  public addListener(
    listener: (message: EdgeSocketMessage) => void,
  ): () => void {
    this.listeners.add(listener);
    const unlisten = this.socket.addListener((message) =>
      this.onMessage(message),
    );
    return () => {
      this.listeners.delete(listener);
      unlisten();
    };
  }

  public async send(message: string | number[]): Promise<void> {
    try {
      await this.socket.send(message);
    } catch (error) {
      this.emit({ type: "Error", data: error });
      throw error;
    }
  }

  public async disconnect(): Promise<void> {
    try {
      await this.socket.disconnect();
    } catch (error) {
      this.emit({ type: "Error", data: error });
      throw error;
    }
  }

  private onMessage(message: TauriWebSocketMessage): void {
    switch (message.type) {
      case "Text":
      case "Binary":
      case "Ping":
      case "Pong":
        this.emit(message);
        return;
      case "Close":
        this.emit({ type: "Close", data: message.data });
    }
  }

  private emit(message: EdgeSocketMessage): void {
    for (const listener of this.listeners) listener(message);
  }
}

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = "1-143.0.3650.75";
const EDGE_WSS =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600n;
const FIVE_MINUTES_SECONDS = 300n;
const HUNDRED_NS_PER_SECOND = 10_000_000n;
const DEFAULT_TIMEOUT_MS = 25_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function abortError(): Error {
  return new DOMException("Speech cancelled", "AbortError");
}

function normalizeRandomId(value: string): string {
  const normalized = value.replace(/-/g, "").replace(/[^A-Fa-f0-9]/g, "");
  if (normalized.length >= 32) return normalized.slice(0, 32).toLowerCase();
  return normalized.padEnd(32, "0").slice(0, 32).toLowerCase();
}

function defaultRandomId(): string {
  return normalizeRandomId(crypto.randomUUID());
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("'", "&apos;")
    .replaceAll('"', "&quot;");
}

function languageFromVoice(voice: string): string {
  const match = /^([a-z]{2,3})[-_]([a-z]{2}|\d{3})(?:[-_]|$)/i.exec(voice);
  if (!match?.[1] || !match[2]) return "en-US";
  return `${match[1].toLowerCase()}-${match[2].toUpperCase()}`;
}

function signedPercent(multiplier: number): string {
  const value = Math.round((multiplier - 1) * 100);
  return `${value >= 0 ? "+" : ""}${value}%`;
}

function volumePercent(volume: number): string {
  return `${Math.round(Math.max(0, Math.min(1, volume)) * 100)}%`;
}

function upperHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  )
    .join("")
    .toUpperCase();
}

function edgeTimestamp(nowMs: number): string {
  const date = new Date(nowMs);
  return `${WEEKDAYS[date.getUTCDay()]} ${MONTHS[date.getUTCMonth()]} ${String(date.getUTCDate()).padStart(2, "0")} ${date.getUTCFullYear()} ${String(date.getUTCHours()).padStart(2, "0")}:${String(date.getUTCMinutes()).padStart(2, "0")}:${String(date.getUTCSeconds()).padStart(2, "0")} GMT+0000 (Coordinated Universal Time)`;
}

export async function generateSecMsGec(nowMs = Date.now()): Promise<string> {
  const unixSeconds = BigInt(Math.floor(nowMs / 1_000));
  let fileTimeSeconds = unixSeconds + WINDOWS_EPOCH_OFFSET_SECONDS;
  fileTimeSeconds -= fileTimeSeconds % FIVE_MINUTES_SECONDS;
  const ticks = fileTimeSeconds * HUNDRED_NS_PER_SECOND;
  const payload = new TextEncoder().encode(
    `${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`,
  );
  const digest = await crypto.subtle.digest("SHA-256", payload);
  return upperHex(digest);
}

export function buildEdgeSpeechConfig(timestamp: string): string {
  return [
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
  ].join("\r\n");
}

export function buildEdgeSsml(
  request: EdgeDirectRequest,
  requestId: string,
  timestamp: string,
): string {
  const voice = escapeXml(request.voice);
  const language = escapeXml(languageFromVoice(request.voice));
  const text = escapeXml(request.text);
  const ssml =
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${language}'><voice name='${voice}'>` +
    `<prosody pitch='${signedPercent(request.pitch)}' rate='${signedPercent(request.rate)}' volume='${volumePercent(request.volume)}'>` +
    `${text}</prosody></voice></speak>`;
  return [
    `X-RequestId:${requestId}`,
    "Content-Type:application/ssml+xml",
    `X-Timestamp:${timestamp}Z`,
    "Path:ssml",
    "",
    ssml,
  ].join("\r\n");
}

function parsePath(text: string): string {
  const separator = text.indexOf("\r\n\r\n");
  const headers = separator >= 0 ? text.slice(0, separator) : text;
  for (const line of headers.split("\r\n")) {
    const index = line.indexOf(":");
    if (index < 0) continue;
    if (line.slice(0, index).trim().toLowerCase() === "path")
      return line
        .slice(index + 1)
        .trim()
        .toLowerCase();
  }
  return "";
}

export function parseEdgeAudioFrame(
  value: number[] | Uint8Array,
): Uint8Array | undefined {
  const bytes = value instanceof Uint8Array ? value : Uint8Array.from(value);
  if (bytes.length < 3) return undefined;
  const headerLength = ((bytes[0] ?? 0) << 8) | (bytes[1] ?? 0);
  const payloadOffset = 2 + headerLength;
  if (headerLength <= 0 || payloadOffset > bytes.length) return undefined;
  const headerText = new TextDecoder().decode(bytes.subarray(2, payloadOffset));
  if (parsePath(headerText) !== "audio") return undefined;
  if (payloadOffset === bytes.length) return undefined;
  return bytes.slice(payloadOffset);
}

async function defaultConnect(
  url: string,
  config?: Parameters<EdgeSocketConnect>[1],
): Promise<EdgeSocket> {
  const module = await import("@tauri-apps/plugin-websocket");
  const socket = await module.default.connect(url, config);
  return new TauriEdgeSocketAdapter(socket);
}

export function canUseNativeEdgeTransport(
  value: typeof globalThis = globalThis,
): boolean {
  const candidate = value as typeof globalThis & {
    __TAURI_INTERNALS__?: { invoke?: unknown };
    __TAURI__?: { invoke?: unknown };
  };
  return Boolean(
    candidate.__TAURI_INTERNALS__?.invoke ?? candidate.__TAURI__?.invoke,
  );
}

export async function synthesizeEdgeDirect(
  request: EdgeDirectRequest,
  dependencies: EdgeDirectDependencies = {},
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) throw abortError();
  edgeDiagnostic("info", "tts.edge.capability", "Using direct Edge transport");
  edgeDiagnostic("info", "tts.edge.provider", "Keyless Edge WebSocket");
  const connect = dependencies.connect ?? defaultConnect;
  const now = dependencies.now ?? Date.now;
  const randomId = dependencies.randomId ?? defaultRandomId;
  const requestId = normalizeRandomId(randomId());
  const connectionId = normalizeRandomId(randomId());
  const muid = normalizeRandomId(randomId()).toUpperCase();
  const timestamp = edgeTimestamp(now());
  const secMsGec = await generateSecMsGec(now());
  if (signal?.aborted) throw abortError();
  const url = new URL(EDGE_WSS);
  url.searchParams.set("TrustedClientToken", TRUSTED_CLIENT_TOKEN);
  url.searchParams.set("Sec-MS-GEC", secMsGec);
  url.searchParams.set("Sec-MS-GEC-Version", SEC_MS_GEC_VERSION);
  url.searchParams.set("ConnectionId", connectionId);

  let socket: EdgeSocket;
  try {
    edgeDiagnostic("info", "tts.edge.connect", "Opening speech socket");
    socket = await connect(url.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br, zstd",
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        Origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
        Cookie: `MUID=${muid}`,
      },
      maxMessageSize: 16 * 1024 * 1024,
      maxFrameSize: 16 * 1024 * 1024,
    });
  } catch (error) {
    edgeDiagnostic("error", "tts.edge.connect", error);
    throw error;
  }
  if (signal?.aborted) {
    await socket.disconnect().catch(() => undefined);
    throw abortError();
  }
  edgeDiagnostic("info", "tts.edge.handshake", "Speech socket accepted");

  return await new Promise<Blob>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let settled = false;
    let disconnected = false;
    const disconnect = async () => {
      if (disconnected) return;
      disconnected = true;
      try {
        await socket.disconnect();
      } catch {
        // Disconnect is best-effort after a terminal speech state.
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      removeListener();
      signal?.removeEventListener("abort", onAbort);
    };
    let stage = "receive";
    const fail = (error: Error, failedStage = stage) => {
      if (settled) return;
      settled = true;
      cleanup();
      edgeDiagnostic(
        failedStage === "abort" ? "info" : "error",
        `tts.edge.${failedStage}`,
        error,
      );
      void disconnect().finally(() => reject(error));
    };
    const finish = () => {
      if (settled) return;
      if (chunks.length === 0) {
        fail(new Error("Edge speech completed without audio"));
        return;
      }
      settled = true;
      cleanup();
      const blob = new Blob(
        chunks.map((chunk) => chunk.slice().buffer as ArrayBuffer),
        { type: "audio/mpeg" },
      );
      edgeDiagnostic(
        "info",
        "tts.edge.audio",
        `Received ${blob.size} audio bytes`,
      );
      void disconnect().finally(() => resolve(blob));
    };
    const onAbort = () => {
      fail(abortError(), "abort");
    };
    const removeListener = socket.addListener((message) => {
      if (settled) return;
      if (message.type === "Binary") {
        const audio = parseEdgeAudioFrame(message.data);
        if (audio?.byteLength) chunks.push(audio);
        return;
      }
      if (message.type === "Text") {
        if (parsePath(message.data) === "turn.end") finish();
        return;
      }
      if (message.type === "Error") {
        const error =
          message.data instanceof Error
            ? message.data
            : new Error("Edge speech socket failed");
        fail(error);
        return;
      }
      if (message.type === "Close")
        fail(new Error("Edge speech connection closed before audio completed"));
    });
    const timeout = setTimeout(
      () => fail(new Error("Edge speech timed out")),
      DEFAULT_TIMEOUT_MS,
    );
    signal?.addEventListener("abort", onAbort, { once: true });

    void (async () => {
      try {
        stage = "config";
        edgeDiagnostic("info", "tts.edge.config", "Sending speech config");
        await socket.send(buildEdgeSpeechConfig(timestamp));
        if (signal?.aborted) throw abortError();
        stage = "ssml";
        edgeDiagnostic("info", "tts.edge.ssml", "Sending SSML request");
        await socket.send(buildEdgeSsml(request, requestId, timestamp));
        stage = "receive";
        edgeDiagnostic("info", "tts.edge.receive", "Waiting for audio frames");
      } catch (error) {
        fail(
          signal?.aborted
            ? abortError()
            : error instanceof Error
              ? error
              : new Error("Edge speech transport failed"),
          signal?.aborted ? "abort" : stage,
        );
      }
    })();
  });
}
