import { SpeechOrchestrator } from "@gys/domain";
import type { SpeechEnginePreference, SpeechVoice } from "@gys/contracts";
import { BrowserSpeechProvider } from "./platform.js";
import { midiPlayer } from "./midi-player.js";
import { EdgeSpeechProvider } from "./edge-speech.js";
import {
  persistSpeechSettings,
  readSpeechSettings,
} from "./speech-settings.js";
import { recordDiagnostic } from "./diagnostics.js";

export type SpeechContext = { path: string; label: string };
export type SpeechQueueItem = {
  id: string;
  text: string;
  context?: SpeechContext;
};
export type { SpeechEnginePreference } from "@gys/contracts";
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
  available: boolean;
  engine: SpeechEnginePreference;
  context: SpeechContext | undefined;
  error?: string | undefined;
};

const initial: SpeechSnapshot = {
  status: "idle",
  currentIndex: -1,
  total: 0,
  voices: [],
  rate: 0.9,
  pitch: 1,
  volume: 1,
  available: false,
  engine: "auto",
  context: undefined,
};

class BrowserSpeechSession {
  private readonly browserProvider = new BrowserSpeechProvider();
  private readonly edgeProvider = new EdgeSpeechProvider();
  private orchestrator = new SpeechOrchestrator([
    this.edgeProvider,
    this.browserProvider,
  ]);
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
      const [edgeVoices, browserVoices, edgeStatus, browserStatus] =
        await Promise.all([
          this.edgeProvider.voices(),
          this.browserProvider.voices(),
          this.edgeProvider.status(),
          this.browserProvider.status(),
        ]);
      const voices = [
        ...edgeVoices,
        ...browserVoices.filter(
          (voice) => !edgeVoices.some((candidate) => candidate.id === voice.id),
        ),
      ];
      const saved = readSpeechSettings(localStorage);
      const engine: SpeechEnginePreference = saved.engine;
      this.patch({
        voices,
        available:
          engine === "edge"
            ? edgeStatus.available
            : engine === "local"
              ? browserStatus.available
              : edgeStatus.available || browserStatus.available,
        engine,
        ...(saved.voiceId && voices.some((voice) => voice.id === saved.voiceId)
          ? { voiceId: saved.voiceId }
          : {}),
        rate: saved.rate,
        pitch: saved.pitch,
        volume: saved.volume,
      });
    } catch (error) {
      // A browser can expose speechSynthesis but never publish its voices.
      recordDiagnostic("warn", "tts.voices", error);
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
    this.orchestrator = new SpeechOrchestrator(
      this.providersFor(this.state.engine),
    );
    this.queue = queue.map((item) => ({ ...item }));
    const nextRate = clamp(options.rate ?? this.state.rate, 0.5, 2);
    const nextPitch = clamp(options.pitch ?? this.state.pitch, 0.5, 2);
    const nextVolume = clamp(options.volume ?? this.state.volume, 0, 1);
    persistSpeechSettings(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      {
        ...(options.voiceId !== undefined ? { voiceId: options.voiceId } : {}),
        rate: nextRate,
        pitch: nextPitch,
        volume: nextVolume,
      },
    );
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
        this.patch({
          status: "speaking",
          currentIndex: index,
          context: item.context,
        });
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
      recordDiagnostic("error", "tts.playback", error);
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
      ...(clearQueue ? { context: undefined } : {}),
    });
  }

  public setVoice(voiceId: string): void {
    persistSpeechSettings(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      { voiceId },
    );
    this.patch({ voiceId });
  }
  public setEngine(engine: SpeechEnginePreference): void {
    persistSpeechSettings(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      { engine },
    );
    this.patch({ engine, available: false });
    void this.refreshAvailability(engine);
  }
  public setRate(rate: number): void {
    const next = clamp(rate, 0.5, 2);
    persistSpeechSettings(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      { rate: next },
    );
    this.patch({ rate: next });
  }
  public setPitch(pitch: number): void {
    const next = clamp(pitch, 0.5, 2);
    persistSpeechSettings(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      { pitch: next },
    );
    this.patch({ pitch: next });
  }
  public setVolume(volume: number): void {
    const next = clamp(volume, 0, 1);
    persistSpeechSettings(
      typeof localStorage !== "undefined" ? localStorage : undefined,
      { volume: next },
    );
    this.patch({ volume: next });
  }

  private patch(next: Partial<SpeechSnapshot>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }

  private providersFor(engine: SpeechEnginePreference) {
    if (engine === "edge") return [this.edgeProvider];
    if (engine === "local") return [this.browserProvider];
    return [this.edgeProvider, this.browserProvider];
  }

  private async refreshAvailability(
    engine: SpeechEnginePreference,
  ): Promise<void> {
    const [edgeStatus, browserStatus] = await Promise.all([
      this.edgeProvider.status(),
      this.browserProvider.status(),
    ]);
    this.patch({
      available:
        engine === "edge"
          ? edgeStatus.available
          : engine === "local"
            ? browserStatus.available
            : edgeStatus.available || browserStatus.available,
    });
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export const speechPlayer = new BrowserSpeechSession();
if (typeof window !== "undefined") void speechPlayer.loadVoices();
