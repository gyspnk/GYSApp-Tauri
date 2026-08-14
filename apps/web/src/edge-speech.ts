import type { SpeechProvider, SpeechVoice } from "@gys/contracts";

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

const voices: SpeechVoice[] = [
  {
    id: "id-ID-GadisNeural",
    name: "Gadis (Edge)",
    language: "id-ID",
    local: false,
  },
  {
    id: "id-ID-ArdiNeural",
    name: "Ardi (Edge)",
    language: "id-ID",
    local: false,
  },
  {
    id: "en-US-AvaNeural",
    name: "Ava (Edge)",
    language: "en-US",
    local: false,
  },
  {
    id: "zh-CN-XiaoxiaoNeural",
    name: "Xiaoxiao (Edge)",
    language: "zh-CN",
    local: false,
  },
];

function abortError(): Error {
  return new DOMException("Speech cancelled", "AbortError");
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class EdgeSpeechProvider implements SpeechProvider {
  public readonly id = "edge-compatibility";
  private active: HTMLAudioElement | undefined;
  private activeUrl: string | undefined;
  private activeCancel: ((error: Error) => void) | undefined;

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
    return { available: true, offline: false };
  }

  public async voices(signal?: AbortSignal): Promise<SpeechVoice[]> {
    if (signal?.aborted || !configuredEndpoint) return [];
    return voices.map((voice) => ({ ...voice }));
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
    if (!configuredEndpoint)
      throw new Error("Edge compatibility endpoint is not configured");
    if (signal?.aborted) throw abortError();
    await this.stop();
    const requestInit: RequestInit = {
      method: "POST",
      headers: { accept: "audio/mpeg", "content-type": "application/json" },
      body: JSON.stringify({
        text: text.slice(0, 8_000),
        voice:
          options.voiceId &&
          voices.some((voice) => voice.id === options.voiceId)
            ? options.voiceId
            : "id-ID-GadisNeural",
        rate: clamp(options.rate ?? 0.9, 0.5, 2),
        pitch: clamp(options.pitch ?? 1, 0.5, 2),
        volume: clamp(options.volume ?? 1, 0, 1),
      }),
    };
    if (signal) requestInit.signal = signal;
    const response = await fetch(configuredEndpoint, requestInit);
    if (!response.ok)
      throw new Error(`Edge speech failed (${response.status})`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.startsWith("audio/"))
      throw new Error("Edge speech returned a non-audio response");
    const url = URL.createObjectURL(await response.blob());
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = clamp(options.volume ?? 1, 0, 1);
    audio.playbackRate = clamp(options.rate ?? 0.9, 0.5, 2);
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
}

export function isEdgeSpeechConfigured(): boolean {
  return Boolean(configuredEndpoint);
}
