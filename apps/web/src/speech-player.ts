import { SpeechOrchestrator } from "@gys/domain";
import type { SpeechVoice } from "@gys/contracts";
import { BrowserSpeechProvider } from "./platform.js";
import { midiPlayer } from "./midi-player.js";

export type SpeechQueueItem = { id: string; text: string };
export type SpeechSnapshot = {
  status: "idle" | "loading" | "speaking" | "paused" | "error";
  currentIndex: number;
  total: number;
  providerId?: string;
  offline?: boolean;
  voices: SpeechVoice[];
  voiceId?: string;
  rate: number;
  pitch: number;
  volume: number;
  error?: string | undefined;
};

const VOICE_KEY = "gys-speech-voice-v1";
const RATE_KEY = "gys-speech-rate-v1";
const initial: SpeechSnapshot = {
  status: "idle",
  currentIndex: -1,
  total: 0,
  voices: [],
  rate: 0.9,
  pitch: 1,
  volume: 1,
};

class BrowserSpeechSession {
  private readonly provider = new BrowserSpeechProvider();
  private readonly orchestrator = new SpeechOrchestrator([this.provider]);
  private queue: SpeechQueueItem[] = [];
  private abortController: AbortController | undefined;
  private state: SpeechSnapshot = { ...initial };
  private readonly listeners = new Set<() => void>();

  public snapshot = (): SpeechSnapshot => this.state;
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public async loadVoices(): Promise<void> {
    if (typeof window === "undefined") return;
    try {
      const voices = await this.provider.voices();
      const savedVoice = localStorage.getItem(VOICE_KEY) ?? undefined;
      const savedRate = Number(localStorage.getItem(RATE_KEY));
      this.patch({
        voices,
        ...(savedVoice && voices.some((voice) => voice.id === savedVoice)
          ? { voiceId: savedVoice }
          : {}),
        ...(Number.isFinite(savedRate) && savedRate >= 0.5 && savedRate <= 2
          ? { rate: savedRate }
          : {}),
      });
    } catch {
      // A browser can expose speechSynthesis but never publish its voices.
      this.patch({ voices: [] });
    }
  }

  public async speak(
    queue: readonly SpeechQueueItem[],
    options: {
      voiceId?: string | undefined;
      rate?: number;
      pitch?: number;
      volume?: number;
    } = {},
  ): Promise<void> {
    if (!queue.length) return;
    await midiPlayer.pause().catch(() => undefined);
    await this.stop(false);
    this.queue = queue.map((item) => ({ ...item }));
    const nextRate = clamp(options.rate ?? this.state.rate, 0.5, 2);
    const nextPitch = clamp(options.pitch ?? this.state.pitch, 0.5, 2);
    const nextVolume = clamp(options.volume ?? this.state.volume, 0, 1);
    if (typeof localStorage !== "undefined") {
      if (options.voiceId !== undefined)
        localStorage.setItem(VOICE_KEY, options.voiceId);
      localStorage.setItem(RATE_KEY, String(nextRate));
    }
    this.abortController = new AbortController();
    this.patch({
      status: "loading",
      currentIndex: 0,
      total: this.queue.length,
      rate: nextRate,
      pitch: nextPitch,
      volume: nextVolume,
      ...(options.voiceId !== undefined ? { voiceId: options.voiceId } : {}),
      error: undefined,
    });
    try {
      for (let index = 0; index < this.queue.length; index += 1) {
        const item = this.queue[index];
        if (!item) continue;
        if (this.abortController.signal.aborted) return;
        this.patch({ status: "speaking", currentIndex: index });
        const speechOptions = {
          rate: this.state.rate,
          pitch: this.state.pitch,
          volume: this.state.volume,
          ...(this.state.voiceId ? { voiceId: this.state.voiceId } : {}),
        };
        const result = await this.orchestrator.speak(
          item.text,
          speechOptions,
          this.abortController.signal,
        );
        this.patch({ providerId: result.providerId, offline: result.offline });
      }
      this.patch({ status: "idle", currentIndex: -1 });
    } catch (error) {
      if (this.abortController.signal.aborted) return;
      this.patch({
        status: "error",
        error: error instanceof Error ? error.message : "Pembaca suara gagal",
      });
    } finally {
      this.abortController = undefined;
    }
  }

  public async pause(): Promise<void> {
    if (this.state.status !== "speaking") return;
    await this.orchestrator.pause();
    this.patch({ status: "paused" });
  }

  public async resume(): Promise<void> {
    if (this.state.status !== "paused") return;
    await this.orchestrator.resume();
    this.patch({ status: "speaking" });
  }

  public async stop(clearQueue = true): Promise<void> {
    this.abortController?.abort();
    this.abortController = undefined;
    await this.orchestrator.stop();
    if (clearQueue) this.queue = [];
    this.patch({
      status: "idle",
      currentIndex: -1,
      total: clearQueue ? 0 : this.state.total,
    });
  }

  public setVoice(voiceId: string): void {
    if (typeof localStorage !== "undefined")
      localStorage.setItem(VOICE_KEY, voiceId);
    this.patch({ voiceId });
  }
  public setRate(rate: number): void {
    const next = clamp(rate, 0.5, 2);
    if (typeof localStorage !== "undefined")
      localStorage.setItem(RATE_KEY, String(next));
    this.patch({ rate: next });
  }
  public setPitch(pitch: number): void {
    this.patch({ pitch: clamp(pitch, 0.5, 2) });
  }
  public setVolume(volume: number): void {
    this.patch({ volume: clamp(volume, 0, 1) });
  }

  private patch(next: Partial<SpeechSnapshot>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const speechPlayer = new BrowserSpeechSession();
if (typeof window !== "undefined") void speechPlayer.loadVoices();
