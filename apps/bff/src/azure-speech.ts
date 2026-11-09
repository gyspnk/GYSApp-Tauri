// Optional Azure Speech path for the Edge voice set.
//
// The relay (`EDGE_TTS_URL`) needs somebody to host a gateway; Azure Speech is
// the supported cloud service behind the same voice names, so two protected
// bindings are enough to make cloud narration work without extra
// infrastructure. Unset bindings leave the previous behaviour untouched.
import type { EdgeTtsRequest } from "@gys/contracts";

export const AZURE_SPEECH_TIMEOUT_MS = 20_000;
export const AZURE_SPEECH_MAX_BYTES = 10 * 1024 * 1024;
const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

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

export function buildAzureSsml(request: EdgeTtsRequest): string {
  return [
    '<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="en-US">',
    `<voice name="${request.voice}">`,
    `<prosody rate="${signed((request.rate - 1) * 100, "%")}"`,
    ` pitch="${signed((request.pitch - 1) * 100, "Hz")}"`,
    ` volume="${signed((request.volume - 1) * 100, "%")}">`,
    escapeSsml(request.text),
    "</prosody></voice></speak>",
  ].join("");
}

export function azureSpeechUrl(region: string): string {
  return `https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`;
}

export async function synthesizeAzureSpeech(
  request: EdgeTtsRequest,
  options: {
    key: string;
    region: string;
    signal?: AbortSignal;
    fetchImpl?: typeof fetch;
  },
): Promise<Uint8Array> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AZURE_SPEECH_TIMEOUT_MS);
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort);
  try {
    const response = await fetchImpl(azureSpeechUrl(options.region), {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": options.key,
        "Content-Type": "application/ssml+xml",
        "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
        "User-Agent": "GYSApp",
      },
      body: buildAzureSsml(request),
      signal: controller.signal,
    });
    if (!response.ok)
      throw new Error(`Azure speech failed (${response.status})`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("audio/"))
      throw new Error("Azure speech returned invalid media");
    const audio = new Uint8Array(await response.arrayBuffer());
    if (!audio.byteLength) throw new Error("Azure speech returned no audio");
    if (audio.byteLength > AZURE_SPEECH_MAX_BYTES)
      throw new Error("Azure speech media is too large");
    return audio;
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
}
