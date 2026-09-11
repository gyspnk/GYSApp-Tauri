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
  | { type: "Close"; data: unknown };

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

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const SEC_MS_GEC_VERSION = "1-143.0.3650.75";
const EDGE_WSS =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const WINDOWS_EPOCH_OFFSET_SECONDS = 11_644_473_600n;
const FIVE_MINUTES_SECONDS = 300n;
const HUNDRED_NS_PER_SECOND = 10_000_000n;
const DEFAULT_TIMEOUT_MS = 25_000;

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
  const text = escapeXml(request.text);
  const ssml =
    `<speak version='1.0' xml:lang='en-US'><voice name='${voice}'>` +
    `<prosody pitch='${signedPercent(request.pitch)}' rate='${signedPercent(request.rate)}' volume='${volumePercent(request.volume)}'>` +
    `${text}</prosody></voice></speak>`;
  return [
    `X-RequestId:${requestId}`,
    "Content-Type:application/ssml+xml",
    `X-Timestamp:${timestamp}`,
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
  return socket as unknown as EdgeSocket;
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
  const connect = dependencies.connect ?? defaultConnect;
  const now = dependencies.now ?? Date.now;
  const randomId = dependencies.randomId ?? defaultRandomId;
  const requestId = normalizeRandomId(randomId());
  const connectionId = normalizeRandomId(randomId());
  const muid = normalizeRandomId(randomId()).toUpperCase();
  const timestamp = new Date(now()).toString();
  const secMsGec = await generateSecMsGec(now());
  const url = new URL(EDGE_WSS);
  url.searchParams.set("TrustedClientToken", TRUSTED_CLIENT_TOKEN);
  url.searchParams.set("Sec-MS-GEC", secMsGec);
  url.searchParams.set("Sec-MS-GEC-Version", SEC_MS_GEC_VERSION);
  url.searchParams.set("ConnectionId", connectionId);

  const socket = await connect(url.toString(), {
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
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
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
      void disconnect().finally(() => resolve(blob));
    };
    const onAbort = () => fail(abortError());
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
        await socket.send(buildEdgeSpeechConfig(timestamp));
        if (signal?.aborted) throw abortError();
        await socket.send(buildEdgeSsml(request, requestId, timestamp));
      } catch (error) {
        fail(
          signal?.aborted
            ? abortError()
            : error instanceof Error
              ? error
              : new Error("Edge speech transport failed"),
        );
      }
    })();
  });
}
