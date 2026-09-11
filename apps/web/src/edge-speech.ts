import {
  EdgeTtsRequestSchema,
  EdgeTtsVoicesResponseSchema,
  type SpeechProvider,
  type SpeechVoice,
} from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";
import {
  canUseNativeEdgeTransport,
  synthesizeEdgeDirect,
} from "./edge-direct.js";

/**
 * Edge-compatible neural speech supports two online transports:
 * 1. an explicitly configured trusted gateway; and
 * 2. a keyless native Tauri WebSocket transport.
 *
 * Browser/PWA builds intentionally do not attempt the direct Microsoft
 * WebSocket because browsers cannot set the compatibility headers required by
 * that service. They continue to use a configured gateway or system speech.
 */
export const BUILTIN_EDGE_VOICES: SpeechVoice[] = [
  {
    id: "id-ID-GadisNeural",
    name: "Gadis (Indonesia · Wanita)",
    language: "id-ID",
    local: false,
  },
  {
    id: "id-ID-ArdiNeural",
    name: "Ardi (Indonesia · Pria)",
    language: "id-ID",
    local: false,
  },
  {
    id: "en-US-JennyNeural",
    name: "Jenny (English US · Female)",
    language: "en-US",
    local: false,
  },
  {
    id: "en-US-GuyNeural",
    name: "Guy (English US · Male)",
    language: "en-US",
    local: false,
  },
  {
    id: "zh-CN-XiaoxiaoNeural",
    name: "Xiaoxiao (Chinese · Female)",
    language: "zh-CN",
    local: false,
  },
];

export function getCustomEdgeEndpoint(): string {
  if (typeof localStorage !== "undefined") {
    const custom = localStorage.getItem("gys-custom-edge-endpoint-v1")?.trim();
    if (custom) return custom;
  }
  return "";
}

export function setCustomEdgeEndpoint(endpoint: string): void {
  if (typeof localStorage !== "undefined") {
    if (endpoint.trim()) {
      localStorage.setItem("gys-custom-edge-endpoint-v1", endpoint.trim());
    } else {
      localStorage.removeItem("gys-custom-edge-endpoint-v1");
    }
  }
}

export function getEdgeEndpoint(): string {
  const custom = getCustomEdgeEndpoint();
  if (custom) return custom;
  const direct = import.meta.env.VITE_EDGE_TTS_URL?.trim();
  if (direct) return direct;
  const bff = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (!bff) return "";
  if (typeof window !== "undefined" && window.location) {
    try {
      const parsed = new URL(bff, window.location.href);
      if (parsed.port && parsed.port !== window.location.port) return "";
    } catch {
      return "";
    }
  }
  return `${bff.replace(/\/$/, "")}/api/v1/tts/edge`;
}

export function getEdgeVoicesEndpoint(): string {
  const direct = import.meta.env.VITE_EDGE_TTS_VOICES_URL?.trim();
  if (direct) return direct;
  const edge = getEdgeEndpoint();
  if (edge)
    return edge.replace(/\/api\/v1\/tts\/edge\/?$/, "/api/v1/tts/edge/voices");
  return "";
}

const DEFAULT_EDGE_VOICE =
  import.meta.env.VITE_EDGE_TTS_DEFAULT_VOICE?.trim() &&
  /^[A-Za-z0-9-]{2,80}$/.test(
    import.meta.env.VITE_EDGE_TTS_DEFAULT_VOICE.trim(),
  )
    ? import.meta.env.VITE_EDGE_TTS_DEFAULT_VOICE.trim()
    : "id-ID-GadisNeural";
const VOICE_CACHE_TTL_MS = 5 * 60_000;

function abortError(): Error {
  return new DOMException("Speech cancelled", "AbortError");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function remoteVoice(value: SpeechVoice): SpeechVoice {
  return { ...value, local: false };
}

export class EdgeSpeechProvider implements SpeechProvider {
  public readonly id = "edge-compatibility";
  private active: HTMLAudioElement | undefined;
  private activeUrl: string | undefined;
  private activeCancel: ((error: Error) => void) | undefined;
  private advertisedVoices: SpeechVoice[] = [];
  private voicesExpiresAt = 0;
  private voicesRequest: Promise<SpeechVoice[]> | undefined;

  public async status(): Promise<{
    available: boolean;
    offline: boolean;
    reason?: string;
  }> {
    if (typeof window === "undefined")
      return {
        available: false,
        offline: false,
        reason: "Speech UI is unavailable",
      };
    if (getEdgeEndpoint() || canUseNativeEdgeTransport())
      return { available: true, offline: false };
    return {
      available: false,
      offline: false,
      reason:
        "Edge-compatible speech requires the native app or a configured gateway",
    };
  }

  public async voices(signal?: AbortSignal): Promise<SpeechVoice[]> {
    if (signal?.aborted) return BUILTIN_EDGE_VOICES.map(remoteVoice);
    const endpoint = getEdgeEndpoint();
    const voicesEndpoint = getEdgeVoicesEndpoint();
    if (!endpoint || !voicesEndpoint)
      return BUILTIN_EDGE_VOICES.map(remoteVoice);
    if (this.voicesExpiresAt > Date.now() && this.advertisedVoices.length > 0)
      return this.advertisedVoices.map(remoteVoice);
    if (this.voicesRequest) return this.voicesRequest;

    const request = this.fetchVoices(voicesEndpoint, signal);
    this.voicesRequest = request;
    try {
      const fetched = await request;
      return (fetched.length > 0 ? fetched : BUILTIN_EDGE_VOICES).map(
        remoteVoice,
      );
    } finally {
      if (this.voicesRequest === request) this.voicesRequest = undefined;
    }
  }

  public async speak(
    text: string,
    options: {
      voiceId?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted) throw abortError();
    await this.stop();
    const parsed = EdgeTtsRequestSchema.parse({
      text: text.slice(0, 8_000),
      voice: this.selectVoice(options.voiceId),
      rate: clamp(options.rate ?? 0.9, 0.5, 2),
      pitch: clamp(options.pitch ?? 1, 0.5, 2),
      volume: clamp(options.volume ?? 1, 0, 1),
    });

    let blob: Blob;
    const endpoint = getEdgeEndpoint();
    if (endpoint) {
      blob = await this.fetchGatewayAudio(endpoint, parsed, signal);
    } else if (canUseNativeEdgeTransport()) {
      try {
        blob = await synthesizeEdgeDirect(parsed, {}, signal);
      } catch (error) {
        if (signal?.aborted) throw abortError();
        const failure =
          error instanceof Error
            ? error
            : new Error("Edge speech transport failed");
        recordDiagnostic("error", "tts.edge.direct", failure);
        throw failure;
      }
    } else {
      throw new Error(
        "Edge-compatible speech requires the native app or a configured gateway",
      );
    }

    await this.playAudioBlob(blob, parsed.rate, parsed.volume, signal);
  }

  public async pause(): Promise<void> {
    this.active?.pause();
  }

  public async resume(): Promise<void> {
    if (this.active) await this.active.play();
  }

  public async stop(): Promise<void> {
    this.activeCancel?.(abortError());
    this.active?.pause();
    this.active?.removeAttribute("src");
    if (this.activeUrl) URL.revokeObjectURL(this.activeUrl);
    this.active = undefined;
    this.activeUrl = undefined;
    this.activeCancel = undefined;
  }

  private async fetchGatewayAudio(
    endpoint: string,
    parsed: ReturnType<typeof EdgeTtsRequestSchema.parse>,
    signal?: AbortSignal,
  ): Promise<Blob> {
    const requestInit: RequestInit = {
      method: "POST",
      headers: { accept: "audio/mpeg", "content-type": "application/json" },
      body: JSON.stringify(parsed),
    };
    if (signal) requestInit.signal = signal;
    let response: Response;
    try {
      response = await fetch(endpoint, requestInit);
    } catch (error) {
      if (signal?.aborted) throw abortError();
      const failure =
        error instanceof Error
          ? error
          : new Error("Edge speech request failed");
      recordDiagnostic("error", "tts.edge.request", failure);
      throw failure;
    }
    if (!response.ok) {
      const failure = new Error(`Edge speech failed (${response.status})`);
      recordDiagnostic("error", "tts.edge.response", failure);
      throw failure;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("audio/")) {
      const failure = new Error("Edge speech returned a non-audio response");
      recordDiagnostic("error", "tts.edge.response", failure);
      throw failure;
    }
    return response.blob();
  }

  private async playAudioBlob(
    blob: Blob,
    rate: number,
    volume: number,
    signal?: AbortSignal,
  ): Promise<void> {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = clamp(volume, 0, 1);
    audio.playbackRate = clamp(rate, 0.5, 2);
    this.active = audio;
    this.activeUrl = url;

    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener("abort", abort);
        audio.onended = null;
        audio.onerror = null;
        if (this.active === audio) this.active = undefined;
        if (this.activeUrl === url) this.activeUrl = undefined;
        if (this.activeCancel === fail) this.activeCancel = undefined;
        URL.revokeObjectURL(url);
      };
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        audio.pause();
        audio.removeAttribute("src");
        cleanup();
        reject(error);
      };
      const abort = () => fail(abortError());
      this.activeCancel = fail;
      signal?.addEventListener("abort", abort, { once: true });
      audio.onended = finish;
      audio.onerror = () => fail(new Error("Edge audio playback failed"));
      void audio
        .play()
        .catch((error: unknown) =>
          fail(
            error instanceof Error
              ? error
              : new Error("Edge audio playback failed"),
          ),
        );
    });
  }

  private selectVoice(requested?: string): string {
    if (!requested || !/^[A-Za-z0-9-]{2,80}$/.test(requested))
      return DEFAULT_EDGE_VOICE;
    if (
      this.advertisedVoices.length > 0 &&
      !this.advertisedVoices.some((voice) => voice.id === requested) &&
      !BUILTIN_EDGE_VOICES.some((voice) => voice.id === requested)
    )
      return DEFAULT_EDGE_VOICE;
    return requested;
  }

  private async fetchVoices(
    voicesEndpoint: string,
    signal?: AbortSignal,
  ): Promise<SpeechVoice[]> {
    if (!voicesEndpoint) return [];
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2_500);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(voicesEndpoint, {
        headers: { accept: "application/json" },
        signal: controller.signal,
        cache: "no-cache",
      });
      if (!response.ok) return [];
      const payload: unknown = await response.json();
      const parsed = EdgeTtsVoicesResponseSchema.safeParse(
        Array.isArray(payload) ? { voices: payload } : payload,
      );
      if (!parsed.success) return [];
      this.advertisedVoices = parsed.data.voices.map(remoteVoice);
      this.voicesExpiresAt = Date.now() + VOICE_CACHE_TTL_MS;
      return this.advertisedVoices;
    } catch {
      return [];
    } finally {
      window.clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    }
  }
}

export function isEdgeSpeechConfigured(): boolean {
  return Boolean(getEdgeEndpoint()) || canUseNativeEdgeTransport();
}
