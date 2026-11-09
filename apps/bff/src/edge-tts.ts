// Keyless Edge speech synthesis inside the Worker.
//
// Production used to depend on a separate `EDGE_TTS_URL` relay. That made a
// working feature look broken until somebody set a secret, so the default is
// now Microsoft's own read-aloud socket, spoken to directly: no account, no
// API key, no operator step. `EDGE_TTS_URL` still wins when an operator wants
// a vetted relay instead.
import type { EdgeTtsRequest, EdgeTtsVoice } from "@gys/contracts";

const TRUSTED_CLIENT_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const CHROMIUM_VERSION = "130.0.2849.68";
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_VERSION}`;
const SPEECH_HOST =
  "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1";
const ORIGIN = "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold";
const USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VERSION.split(".")[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_VERSION.split(".")[0]}.0.0.0`;
const AUDIO_FORMAT = "audio-24khz-48kbitrate-mono-mp3";
export const NATIVE_EDGE_TIMEOUT_MS = 20_000;
export const NATIVE_EDGE_MAX_BYTES = 10 * 1024 * 1024;

/** The socket rejects a stale token, so the clock is rounded to five minutes. */
export function speechClockTicks(nowMs: number): number {
  const seconds = Math.floor(nowMs / 1000) + 11_644_473_600;
  return Math.floor(seconds / 300) * 300 * 10_000_000;
}

export async function msGecToken(nowMs: number): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${speechClockTicks(nowMs)}${TRUSTED_CLIENT_TOKEN}`,
    ),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

function escapeSsml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function signed(value: number, unit: string): string {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? "+" : ""}${rounded}${unit}`;
}

export function buildSsml(request: EdgeTtsRequest): string {
  const rate = signed((request.rate - 1) * 100, "%");
  const pitch = signed((request.pitch - 1) * 100, "Hz");
  const volume = signed((request.volume - 1) * 100, "%");
  return [
    `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">`,
    `<voice name="${request.voice}">`,
    `<prosody rate="${rate}" pitch="${pitch}" volume="${volume}">`,
    `${escapeSsml(request.text)}`,
    `</prosody></voice></speak>`,
  ].join("");
}

export function speechConfigFrame(): string {
  return [
    "X-Timestamp:" + new Date().toISOString(),
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
            outputFormat: AUDIO_FORMAT,
          },
        },
      },
    }),
  ].join("\r\n");
}

export function ssmlFrame(ssml: string): string {
  return [
    "X-RequestId:" + crypto.randomUUID().replace(/-/g, ""),
    "Content-Type:application/ssml+xml",
    "X-Timestamp:" + new Date().toISOString() + "Z",
    "Path:ssml",
    "",
    ssml,
  ].join("\r\n");
}

/** Binary frames carry a 2-byte big-endian header length, then the audio. */
export function audioFromFrame(buffer: ArrayBuffer): Uint8Array | undefined {
  if (buffer.byteLength < 2) return undefined;
  const view = new DataView(buffer);
  const headerLength = view.getUint16(0);
  if (headerLength + 2 > buffer.byteLength) return undefined;
  const header = new TextDecoder().decode(
    new Uint8Array(buffer, 2, headerLength),
  );
  if (!/Path:\s*audio/i.test(header)) return undefined;
  return new Uint8Array(buffer, 2 + headerLength);
}

type EdgeSocket = {
  accept(): void;
  send(data: string): void;
  close(): void;
  addEventListener(
    type: "message",
    listener: (event: { data: unknown }) => void,
  ): void;
  addEventListener(type: "close" | "error", listener: () => void): void;
};

export type SpeechSocketFactory = (url: string) => Promise<EdgeSocket>;

async function openSpeechSocket(url: string): Promise<EdgeSocket> {
  const response = await fetch(url, {
    headers: {
      Upgrade: "websocket",
      Origin: ORIGIN,
      "User-Agent": USER_AGENT,
      Pragma: "no-cache",
      "Cache-Control": "no-cache",
    },
  });
  const socket = (response as unknown as { webSocket?: EdgeSocket }).webSocket;
  if (!socket)
    throw new Error(`Edge speech upgrade failed (${response.status})`);
  socket.accept();
  return socket;
}

/** Resolves with MP3 bytes, or throws when the socket stays silent. */
export async function synthesizeEdgeSpeech(
  request: EdgeTtsRequest,
  options: {
    now?: number;
    timeoutMs?: number;
    openSocket?: SpeechSocketFactory;
  } = {},
): Promise<Uint8Array> {
  const now = options.now ?? Date.now();
  const token = await msGecToken(now);
  const url = [
    `${SPEECH_HOST}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`,
    "&ConnectionId=" + crypto.randomUUID().replace(/-/g, ""),
    "&Sec-MS-GEC=" + token,
    "&Sec-MS-GEC-Version=" + SEC_MS_GEC_VERSION,
  ].join("");
  const openSocket = options.openSocket ?? openSpeechSocket;
  const socket = await openSocket(url);

  return await new Promise<Uint8Array>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let total = 0;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        // The socket may already be closed by the peer.
      }
      if (error) return reject(error);
      if (!total) return reject(new Error("Edge speech returned no audio"));
      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      resolve(merged);
    };
    const timer = setTimeout(
      () => finish(new Error("Edge speech timed out")),
      options.timeoutMs ?? NATIVE_EDGE_TIMEOUT_MS,
    );

    socket.addEventListener("message", (event) => {
      const data = event.data;
      if (typeof data === "string") {
        if (/Path:\s*turn\.end/i.test(data)) finish();
        return;
      }
      if (!(data instanceof ArrayBuffer)) return;
      const audio = audioFromFrame(data);
      if (!audio || !audio.byteLength) return;
      total += audio.byteLength;
      if (total > NATIVE_EDGE_MAX_BYTES) {
        finish(new Error("Edge speech media is too large"));
        return;
      }
      chunks.push(audio);
    });
    socket.addEventListener("close", () =>
      finish(new Error("Edge speech closed early")),
    );
    socket.addEventListener("error", () =>
      finish(new Error("Edge speech socket failed")),
    );

    try {
      socket.send(speechConfigFrame());
      socket.send(ssmlFrame(buildSsml(request)));
    } catch {
      finish(new Error("Edge speech request could not be sent"));
    }
  });
}

/** Catalog used when no relay is configured; the UI filters by language. */
export const NATIVE_EDGE_VOICES: EdgeTtsVoice[] = [
  {
    id: "id-ID-GadisNeural",
    name: "Gadis (Indonesia)",
    language: "id-ID",
    local: false,
  },
  {
    id: "id-ID-ArdiNeural",
    name: "Ardi (Indonesia)",
    language: "id-ID",
    local: false,
  },
  {
    id: "en-US-AriaNeural",
    name: "Aria (English)",
    language: "en-US",
    local: false,
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy (English)",
    language: "en-US",
    local: false,
  },
  {
    id: "zh-CN-XiaoxiaoNeural",
    name: "晓晓 (中文)",
    language: "zh-CN",
    local: false,
  },
  {
    id: "zh-CN-YunxiNeural",
    name: "云希 (中文)",
    language: "zh-CN",
    local: false,
  },
];
