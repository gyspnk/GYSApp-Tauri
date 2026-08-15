import type { NormalizedMidi } from "@gys/domain";
import { MidiRenderCache, type RenderedPcm } from "./midi-render-cache.js";
import { recordDiagnostic } from "./diagnostics.js";

/**
 * The media player intentionally lives outside React.  A song can keep
 * playing while routes change, and the shell only subscribes to this small
 * external snapshot.  FluidSynth is the preferred backend; the oscillator
 * path remains a compatibility fallback for browsers which do not allow a
 * worker/WASM context to start.
 */
export type WebMidiSnapshot = {
  status:
    "idle" | "loading" | "ready" | "playing" | "paused" | "stopped" | "error";
  songId?: string;
  title?: string;
  duration: number;
  position: number;
  volume: number;
  muted: boolean;
  tempo: number;
  transpose: number;
  backend: "idle" | "fluidsynth" | "oscillator";
  soundfont?: string;
  loadingProgress: number;
  error?: string | undefined;
};

type Note = {
  start: number;
  end: number;
  note: number;
  velocity: number;
  channel: number;
  program: number;
};
type ActiveNote = {
  tick: number;
  note: number;
  velocity: number;
  channel: number;
  program: number;
};
type AudioNodePair = { oscillator: OscillatorNode; gain: GainNode };
type RenderedSong = { key: string; buffer: AudioBuffer };
type WorkerMessage = {
  type: "ready" | "sfLoaded" | "rendered" | "error";
  id?: number;
  err?: string;
  err2?: string;
  error?: string;
  left?: Float32Array;
  right?: Float32Array;
  sampleRate?: number;
};
type PendingRequest = {
  resolve: (message: WorkerMessage) => void;
  reject: (error: Error) => void;
  timer: number;
};

const initial: WebMidiSnapshot = {
  status: "idle",
  duration: 0,
  position: 0,
  volume: 0.7,
  muted: false,
  tempo: 100,
  transpose: 0,
  backend: "idle",
  loadingProgress: 0,
};

const SOUND_FONT_NAME = "TimGM6mb (offline)";
const SOUND_FONT_CACHE = "gys-midi-soundfont-v1";
const SOUND_FONT_PATH = "offline/soundfont/TimGM6mb.sf2";

class BrowserMidiPlayer {
  private current: NormalizedMidi | undefined;
  private rawMidi: Uint8Array | undefined;
  private sourceHash = "";
  private notes: Note[] = [];
  private audio: AudioContext | undefined;
  private master: GainNode | undefined;
  private masterConnected = false;
  private scheduled: AudioNodePair[] = [];
  private bufferSource: AudioBufferSourceNode | undefined;
  private timer: number | undefined;
  private startedAt = 0;
  private positionAtStart = 0;
  private rendered: RenderedSong | undefined;
  private worker: Worker | undefined;
  private workerReady: Promise<void> | undefined;
  private soundfont: Uint8Array | undefined;
  private soundfontRequest: Promise<void> | undefined;
  private soundfontWorker: Worker | undefined;
  private readonly renderCache = new MidiRenderCache();
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private state: WebMidiSnapshot = { ...initial };
  private readonly listeners = new Set<() => void>();
  private readonly endedListeners = new Set<() => void>();

  // React's external-store contract requires a stable snapshot reference
  // until a patch actually changes the store.
  public snapshot = (): WebMidiSnapshot => this.state;
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  public subscribeEnded = (listener: () => void): (() => void) => {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  };

  public async load(
    songId: string,
    title: string,
    midi: NormalizedMidi,
    options: { rawMidi?: Uint8Array; sourceHash?: string } = {},
  ): Promise<void> {
    await this.stopAudio();
    this.current = midi;
    this.rawMidi = options.rawMidi?.slice();
    this.sourceHash = options.sourceHash ?? "";
    this.rendered = undefined;
    this.notes = buildNotes(midi);
    const duration = this.notes.reduce(
      (max, note) => Math.max(max, note.end),
      0,
    );
    this.patch({
      status: "ready",
      songId,
      title,
      duration,
      position: 0,
      tempo: Math.round(midi.tempo),
      transpose: 0,
      backend: "idle",
      loadingProgress: 0,
      error: undefined,
    });
  }

  public async play(): Promise<void> {
    if (!this.current || !this.state.songId)
      throw new Error("MIDI is not loaded");
    const audio = this.ensureAudio();
    await audio.resume();
    const position = Math.min(this.state.position, this.state.duration);

    if (this.rawMidi && typeof Worker !== "undefined") {
      try {
        this.patch({
          status: "loading",
          backend: "fluidsynth",
          loadingProgress: 8,
          error: undefined,
        });
        const rendered = await this.ensureRendered();
        this.startBuffer(rendered.buffer, position);
        this.patch({
          status: "playing",
          backend: "fluidsynth",
          loadingProgress: 100,
          duration: rendered.buffer.duration,
          position,
          soundfont: SOUND_FONT_NAME,
        });
        this.startTimer();
        return;
      } catch (error) {
        // A blocked WASM worker should not make an otherwise valid MIDI file
        // unusable.  Keep a clear compatibility backend and continue with the
        // small Web Audio renderer below.
        recordDiagnostic("warn", "midi.fluidsynth", error);
        this.patch({
          backend: "oscillator",
          loadingProgress: 0,
          error:
            error instanceof Error ? error.message : "FluidSynth unavailable",
        });
      }
    }

    await this.stopAudio();
    this.positionAtStart = position;
    this.startedAt = audio.currentTime;
    this.scheduleOscillator(position);
    this.patch({ status: "playing", backend: "oscillator", error: undefined });
    this.startTimer();
  }

  public async pause(): Promise<void> {
    if (this.state.status !== "playing") return;
    this.updatePositionFromClock();
    await this.stopAudio();
    this.patch({ status: "paused" });
  }

  public async stop(): Promise<void> {
    await this.stopAudio();
    if (this.state.songId) this.patch({ status: "stopped", position: 0 });
  }

  public async seek(position: number): Promise<void> {
    const next = Math.max(0, Math.min(this.state.duration, position));
    const playing = this.state.status === "playing";
    if (playing) this.updatePositionFromClock();
    await this.stopAudio();
    this.patch({
      position: next,
      status: playing ? "paused" : this.state.status,
    });
    if (playing) await this.play();
  }

  public async setVolume(volume: number): Promise<void> {
    const next = Math.max(0, Math.min(1, volume));
    if (this.master) this.master.gain.value = this.state.muted ? 0 : next;
    this.patch({ volume: next });
  }

  public async setMuted(muted: boolean): Promise<void> {
    if (this.master) this.master.gain.value = muted ? 0 : this.state.volume;
    this.patch({ muted });
  }

  public async setTempo(tempo: number): Promise<void> {
    const next = Math.max(30, Math.min(220, Math.round(tempo)));
    const wasPlaying = this.state.status === "playing";
    if (wasPlaying) this.updatePositionFromClock();
    await this.stopAudio();
    this.rendered = undefined;
    this.patch({
      tempo: next,
      status: wasPlaying ? "paused" : this.state.status,
    });
    if (wasPlaying) await this.play();
  }

  public async setTranspose(transpose: number): Promise<void> {
    const next = Math.max(-24, Math.min(24, Math.trunc(transpose)));
    const wasPlaying = this.state.status === "playing";
    if (wasPlaying) this.updatePositionFromClock();
    await this.stopAudio();
    this.rendered = undefined;
    this.patch({
      transpose: next,
      status: wasPlaying ? "paused" : this.state.status,
    });
    if (wasPlaying) await this.play();
  }

  public destroy(): void {
    void this.stopAudio();
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("MIDI player destroyed"));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
    this.workerReady = undefined;
    void this.audio?.close();
    this.audio = undefined;
  }

  private ensureAudio(): AudioContext {
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor)
      throw new Error("Web Audio is unavailable in this browser");
    this.audio ??= new AudioContextCtor();
    this.master ??= this.audio.createGain();
    this.master.gain.value = this.state.muted ? 0 : this.state.volume;
    if (!this.masterConnected) {
      this.master.connect(this.audio.destination);
      this.masterConnected = true;
    }
    return this.audio;
  }

  private async ensureRendered(): Promise<RenderedSong> {
    if (!this.rawMidi || !this.audio)
      throw new Error("Raw MIDI bytes are unavailable");
    const tempoRate =
      this.state.tempo / Math.max(30, this.current?.tempo ?? 100);
    const instrument = -1;
    const key = `${this.sourceHash}:${SOUND_FONT_NAME}:${this.state.tempo}:${this.state.transpose}:${instrument}:${this.audio.sampleRate}`;
    if (this.rendered?.key === key) return this.rendered;
    const cached = await this.renderCache.get(key);
    if (cached) {
      const buffer = this.audio.createBuffer(
        2,
        cached.left.length,
        cached.sampleRate,
      );
      buffer.getChannelData(0).set(cached.left);
      buffer.getChannelData(1).set(cached.right);
      this.rendered = { key, buffer };
      this.patch({ loadingProgress: 94 });
      return this.rendered;
    }
    const worker = await this.ensureWorker();
    await this.ensureSoundfont(worker);
    this.patch({ loadingProgress: 34 });
    const message = await this.request(worker, {
      type: "render",
      midiBuffer: this.rawMidi.slice().buffer,
      sampleRate: this.audio.sampleRate,
      transpose: this.state.transpose,
      instrument,
      tempoRate,
    });
    if (message.type !== "rendered" || !message.left || !message.right)
      throw new Error(message.error ?? "FluidSynth did not return audio");
    const sampleRate = message.sampleRate ?? this.audio.sampleRate;
    const length = Math.min(message.left.length, message.right.length);
    const pcm: RenderedPcm = {
      sampleRate,
      left: message.left.slice(0, length),
      right: message.right.slice(0, length),
    };
    const buffer = this.audio.createBuffer(2, length, sampleRate);
    buffer.getChannelData(0).set(pcm.left);
    buffer.getChannelData(1).set(pcm.right);
    await this.renderCache.put(key, pcm);
    this.rendered = { key, buffer };
    this.patch({ loadingProgress: 94 });
    return this.rendered;
  }

  private async ensureWorker(): Promise<Worker> {
    if (this.worker && this.workerReady) {
      await this.workerReady;
      return this.worker;
    }
    if (typeof Worker === "undefined")
      throw new Error("Web Worker is unavailable");
    if (!this.worker) {
      const base = new URL(import.meta.env.BASE_URL, window.location.href);
      const url = new URL("vendor/midi-render-worker.js", base);
      this.worker = new Worker(url, { name: "gys-fluidsynth-midi" });
      this.worker.addEventListener(
        "message",
        (event: MessageEvent<WorkerMessage>) => {
          const message = event.data;
          if (message.type === "ready") return;
          if (message.id === undefined) return;
          const pending = this.pending.get(message.id);
          if (!pending) return;
          this.pending.delete(message.id);
          window.clearTimeout(pending.timer);
          if (message.type === "error" || message.err || message.err2) {
            pending.reject(
              new Error(
                message.error ??
                  message.err ??
                  message.err2 ??
                  "MIDI worker failed",
              ),
            );
          } else {
            pending.resolve(message);
          }
        },
      );
      this.worker.addEventListener("error", () => {
        this.workerReady = undefined;
        this.soundfontWorker = undefined;
        this.soundfontRequest = undefined;
        for (const pending of this.pending.values())
          pending.reject(new Error("MIDI worker crashed"));
        this.pending.clear();
      });
    }
    this.workerReady ??= new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.workerReady = undefined;
        reject(new Error("MIDI worker startup timed out"));
      }, 30_000);
      const onReady = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type !== "ready") return;
        window.clearTimeout(timer);
        this.worker?.removeEventListener("message", onReady as EventListener);
        resolve();
      };
      this.worker?.addEventListener("message", onReady as EventListener);
      this.worker?.postMessage({ type: "init" });
    });
    try {
      await this.workerReady;
    } catch (error) {
      this.workerReady = undefined;
      throw error;
    }
    return this.worker;
  }

  private async ensureSoundfont(worker: Worker): Promise<void> {
    if (this.soundfontRequest && this.soundfontWorker === worker)
      return this.soundfontRequest;
    this.soundfontWorker = worker;
    this.soundfontRequest = (async () => {
      if (!this.soundfont) {
        const url = new URL(
          SOUND_FONT_PATH,
          new URL(import.meta.env.BASE_URL, window.location.href),
        );
        const cached =
          "caches" in window
            ? await caches
                .open(SOUND_FONT_CACHE)
                .then((cache) => cache.match(url))
            : undefined;
        if (cached) {
          this.soundfont = new Uint8Array(await cached.arrayBuffer());
        } else {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok)
            throw new Error(`SoundFont request failed: ${response.status}`);
          this.soundfont = new Uint8Array(await response.arrayBuffer());
          if ("caches" in window) {
            await caches
              .open(SOUND_FONT_CACHE)
              .then((cache) =>
                cache.put(
                  url,
                  new Response(this.soundfont!.slice().buffer as ArrayBuffer),
                ),
              );
          }
        }
        if (this.soundfont.byteLength < 1_000_000)
          throw new Error("TimGM SoundFont is incomplete");
      }
      this.patch({ loadingProgress: 18, soundfont: SOUND_FONT_NAME });
      await this.request(worker, {
        type: "loadSoundFont",
        buffer: this.soundfont.slice().buffer,
      });
    })();
    try {
      await this.soundfontRequest;
    } catch (error) {
      this.soundfontRequest = undefined;
      throw error;
    }
  }

  private request(
    worker: Worker,
    payload: Record<string, unknown>,
  ): Promise<WorkerMessage> {
    const id = ++this.requestId;
    return new Promise((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error("MIDI worker request timed out"));
      }, 120_000);
      this.pending.set(id, { resolve, reject, timer });
      const transfer: Transferable[] = [];
      const midiBuffer = payload.midiBuffer;
      const soundfontBuffer = payload.buffer;
      if (midiBuffer instanceof ArrayBuffer) transfer.push(midiBuffer);
      if (soundfontBuffer instanceof ArrayBuffer)
        transfer.push(soundfontBuffer);
      worker.postMessage({ ...payload, id }, transfer);
    });
  }

  private startBuffer(buffer: AudioBuffer, position: number): void {
    const audio = this.ensureAudio();
    void this.stopAudio();
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master!);
    const safePosition = Math.max(
      0,
      Math.min(Math.max(0, buffer.duration - 0.02), position),
    );
    this.bufferSource = source;
    this.positionAtStart = safePosition;
    this.startedAt = audio.currentTime;
    source.onended = () => {
      if (this.bufferSource !== source || this.state.status !== "playing")
        return;
      this.bufferSource = undefined;
      this.clearTimer();
      this.patch({ status: "stopped", position: 0 });
      for (const listener of this.endedListeners) listener();
    };
    source.start(0, safePosition);
  }

  private scheduleOscillator(position: number): void {
    if (!this.audio || !this.master) return;
    const now = this.audio.currentTime + 0.03;
    const speed = this.state.tempo / (this.current?.tempo ?? this.state.tempo);
    for (const note of this.notes) {
      const start = note.start / speed - position;
      const end = note.end / speed - position;
      if (end <= 0 || start > this.state.duration - position + 0.1) continue;
      const oscillator = this.audio.createOscillator();
      const gain = this.audio.createGain();
      oscillator.type = waveformForProgram(note.program);
      oscillator.frequency.value =
        440 * 2 ** ((note.note + this.state.transpose - 69) / 12);
      const startAt = now + Math.max(0, start);
      const endAt = now + Math.max(0.06, end);
      gain.gain.setValueAtTime(0.0001, startAt);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.02, (note.velocity / 127) * 0.16),
        startAt + 0.015,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(gain).connect(this.master);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.03);
      this.scheduled.push({ oscillator, gain });
    }
  }

  private startTimer(): void {
    this.clearTimer();
    this.timer = window.setInterval(() => {
      this.updatePositionFromClock();
      if (
        this.state.status === "playing" &&
        this.state.position >= this.state.duration - 0.02 &&
        !this.bufferSource
      ) {
        void this.stopAudio().then(() => {
          this.patch({ status: "stopped", position: 0 });
          for (const listener of this.endedListeners) listener();
        });
      }
    }, 250);
  }

  private updatePositionFromClock(): void {
    if (this.state.status !== "playing" || !this.audio) return;
    const elapsed = this.audio.currentTime - this.startedAt;
    this.patch({
      position: Math.min(this.state.duration, this.positionAtStart + elapsed),
    });
  }

  private async stopAudio(): Promise<void> {
    this.clearTimer();
    if (this.bufferSource) {
      try {
        this.bufferSource.onended = null;
        this.bufferSource.stop();
      } catch {
        /* already stopped */
      }
      this.bufferSource.disconnect();
      this.bufferSource = undefined;
    }
    for (const pair of this.scheduled) {
      try {
        pair.oscillator.stop();
      } catch {
        /* already stopped */
      }
      pair.oscillator.disconnect();
      pair.gain.disconnect();
    }
    this.scheduled = [];
  }

  private clearTimer(): void {
    if (this.timer !== undefined) window.clearInterval(this.timer);
    this.timer = undefined;
  }

  private patch(next: Partial<WebMidiSnapshot>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener();
  }
}

function buildNotes(midi: NormalizedMidi): Note[] {
  const active = new Map<string, ActiveNote[]>();
  const programs = new Map<number, number>();
  const secondsPerTick = 60 / Math.max(30, midi.tempo) / Math.max(1, midi.ppq);
  const notes: Note[] = [];
  for (const event of midi.events) {
    if (event.type === "program") {
      programs.set(event.channel, event.program);
      continue;
    }
    const key = `${event.channel}:${event.note}`;
    if (event.type === "noteOn" && event.velocity > 0) {
      const values = active.get(key) ?? [];
      values.push({
        tick: event.tick,
        note: event.note,
        velocity: event.velocity,
        channel: event.channel,
        program: programs.get(event.channel) ?? 0,
      });
      active.set(key, values);
      continue;
    }
    const values = active.get(key);
    const start = values?.shift();
    if (!start) continue;
    notes.push({
      start: start.tick * secondsPerTick,
      end: Math.max(event.tick, start.tick + 1) * secondsPerTick,
      note: start.note,
      velocity: start.velocity,
      channel: start.channel,
      program: start.program,
    });
  }
  for (const values of active.values()) {
    for (const start of values)
      notes.push({
        start: start.tick * secondsPerTick,
        end: (start.tick + midi.ppq / 2) * secondsPerTick,
        note: start.note,
        velocity: start.velocity,
        channel: start.channel,
        program: start.program,
      });
  }
  return notes;
}

function waveformForProgram(program: number): OscillatorType {
  if ([0, 1, 4, 5, 6, 7].includes(program)) return "triangle";
  if ([24, 25, 26, 27, 28, 29, 30, 31].includes(program)) return "sine";
  if (program >= 56 && program <= 63) return "square";
  return "sawtooth";
}

export const midiPlayer = new BrowserMidiPlayer();
