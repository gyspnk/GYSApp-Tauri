import {
  EdgeTtsRequestSchema,
  EdgeTtsVoicesResponseSchema,
  type SpeechProvider,
  type SpeechVoice,
} from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";

/**
 * Edge compatibility speech is deliberately opt-in at the transport layer.
 * The browser never receives a key: a deployment can point this adapter at
 * the same-origin BFF route (or another trusted compatibility gateway) with
 * VITE_EDGE_TTS_URL. When it is not configured, the orchestrator falls back
 * to a detected system voice instead of pretending that web speech is
 * available offline.
 */
const configuredEndpoint =
  import.meta.env.VITE_EDGE_TTS_URL?.trim() ||
  (import.meta.env.VITE_BFF_BASE_URL?.trim()
    ? `${import.meta.env.VITE_BFF_BASE_URL.trim().replace(/\/$/, "")}/api/v1/tts/edge`
    : "");
const configuredVoicesEndpoint =
  import.meta.env.VITE_EDGE_TTS_VOICES_URL?.trim() ||
  (import.meta.env.VITE_BFF_BASE_URL?.trim()
    ? `${import.meta.env.VITE_BFF_BASE_URL.trim().replace(/\/$/, "")}/api/v1/tts/edge/voices`
    : "");
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
    if (typeof window === "undefined" || !configuredEndpoint)
      return {
        available: false,
        offline: false,
        reason: "Edge compatibility endpoint is not configured",
      };
    // The actual speech request is the health probe. A transient upstream
    // failure must not permanently disable the retry control for this session.
    return { available: true, offline: false };
  }

  public async voices(signal?: AbortSignal): Promise<SpeechVoice[]> {
    if (signal?.aborted || !configuredEndpoint || !configuredVoicesEndpoint)
      return this.advertisedVoices.map(remoteVoice);
    if (this.voicesExpiresAt > Date.now())
      return this.advertisedVoices.map(remoteVoice);
    if (this.voicesRequest) return this.voicesRequest;

    const request = this.fetchVoices(signal);
    this.voicesRequest = request;
    try {
      return (await request).map(remoteVoice);
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
    if (!configuredEndpoint) {
      throw new Error("Edge compatibility endpoint is not configured");
    }
    if (signal?.aborted) throw abortError();
    await this.stop();
    const voiceId = this.selectVoice(options.voiceId);
    const parsed = EdgeTtsRequestSchema.parse({
      text: text.slice(0, 8_000),
      voice: voiceId,
      rate: clamp(options.rate ?? 0.9, 0.5, 2),
      pitch: clamp(options.pitch ?? 1, 0.5, 2),
      volume: clamp(options.volume ?? 1, 0, 1),
    });
    const requestInit: RequestInit = {
      method: "POST",
      headers: { accept: "audio/mpeg", "content-type": "application/json" },
      body: JSON.stringify(parsed),
    };
    if (signal) requestInit.signal = signal;
    let response: Response;
    try {
      response = await fetch(configuredEndpoint, requestInit);
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
    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = clamp(parsed.volume, 0, 1);
    audio.playbackRate = clamp(parsed.rate, 0.5, 2);
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
        if (this.activeCancel) this.activeCancel = undefined;
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

  private selectVoice(requested?: string): string {
    if (!requested || !/^[A-Za-z0-9-]{2,80}$/.test(requested))
      return DEFAULT_EDGE_VOICE;
    if (
      this.advertisedVoices.length > 0 &&
      !this.advertisedVoices.some((voice) => voice.id === requested)
    )
      return DEFAULT_EDGE_VOICE;
    return requested;
  }

  private async fetchVoices(signal?: AbortSignal): Promise<SpeechVoice[]> {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 2_500);
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      const response = await fetch(configuredVoicesEndpoint, {
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
  return Boolean(configuredEndpoint);
}
