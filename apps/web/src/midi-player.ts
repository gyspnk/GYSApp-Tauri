import type { NormalizedMidi } from "@gys/domain";
import { MidiRenderCache, type RenderedPcm } from "./midi-render-cache.js";
import { recordDiagnostic } from "./diagnostics.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";

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
  /** -1 keeps each program embedded in the MIDI file; 0–127 selects GM. */
  instrument: number;
  backend: "idle" | "fluidsynth" | "oscillator";
  soundfont?: string;
  loadingProgress: number;
  error?: string | undefined;
};
export type WebMidiSettings = Pick<
  WebMidiSnapshot,
  "tempo" | "transpose" | "instrument"
>;

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

/**
 * Invalidates asynchronous MIDI work whenever the selected song or a render
 * setting changes. The worker cannot always cancel a render already in WASM,
 * so callers use this gate to ignore a late result before it can touch the
 * shared audio session.
 */
export class MidiOperationGate {
  private generation = 0;

  public next(): number {
    this.generation += 1;
    return this.generation;
  }

  public isCurrent(generation: number): boolean {
    return generation === this.generation;
  }
}

class StaleMidiOperation extends Error {
  public constructor() {
    super("MIDI operation was superseded");
    this.name = "StaleMidiOperation";
  }
}

function throwIfStale(gate: MidiOperationGate, generation: number): void {
  if (!gate.isCurrent(generation)) throw new StaleMidiOperation();
}

function readMidiPreferences(): {
  volume?: number;
  muted?: boolean;
  tempo?: number;
  transpose?: number;
  instrument?: number;
} {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(
      window.localStorage.getItem("gys-midi-preferences-v1") ?? "null",
    );
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const candidate = value as Record<string, unknown>;
    return {
      ...(typeof candidate.volume === "number"
        ? { volume: candidate.volume }
        : {}),
      ...(typeof candidate.muted === "boolean"
        ? { muted: candidate.muted }
        : {}),
      ...(typeof candidate.tempo === "number"
        ? { tempo: candidate.tempo }
        : {}),
      ...(typeof candidate.transpose === "number"
        ? { transpose: candidate.transpose }
        : {}),
      ...(typeof candidate.instrument === "number"
        ? { instrument: candidate.instrument }
        : {}),
    };
  } catch {
    return {};
  }
}

const savedMidiPreferences = readMidiPreferences();

const initial: WebMidiSnapshot = {
  status: "idle",
  duration: 0,
  position: 0,
  volume: Math.max(0, Math.min(1, savedMidiPreferences.volume ?? 0.7)),
  muted: savedMidiPreferences.muted ?? false,
  tempo: Math.max(
    30,
    Math.min(220, Math.round(savedMidiPreferences.tempo ?? 100)),
  ),
  transpose: Math.max(
    -24,
    Math.min(24, Math.trunc(savedMidiPreferences.transpose ?? 0)),
  ),
  instrument: Math.max(
    -1,
    Math.min(127, Math.trunc(savedMidiPreferences.instrument ?? -1)),
  ),
  backend: "idle",
  loadingProgress: 0,
};

const SOUND_FONT_CODE = "GeneralUser-GS";
const SOUND_FONT_NAME = "GeneralUser-GS (terpasang)";
type SoundfontLoader = () => Promise<Uint8Array | undefined>;

export type MidiPreloadRequest = {
  songId: string;
  title?: string;
  midi: NormalizedMidi;
  rawMidi: Uint8Array;
  sourceHash: string;
  /** Target playback tempo. Defaults to the current player setting. */
  tempo?: number;
  /** Shared transpose setting. Defaults to the current player setting. */
  transpose?: number;
  /** GM program override, or -1 to keep embedded programs. */
  instrument?: number;
};

export type MidiPreloadStats = {
  queued: number;
  inFlight: number;
};

/**
 * The render key is deliberately public so diagnostics and tests can prove
 * that a PCM buffer can never be reused across incompatible settings.
 */
export function midiRenderKey(
  sourceHash: string,
  tempo: number,
  transpose: number,
  instrument: number,
  sampleRate = 44_100,
): string {
  return `${sourceHash}:${SOUND_FONT_NAME}:${tempo}:${transpose}:${instrument}:${sampleRate}`;
}

type PreloadRecord = {
  run: () => Promise<boolean>;
  resolve: (value: boolean) => void;
};

/** A small serial queue used to keep WASM rendering predictable on mobile. */
export class MidiPreloadQueue {
  private readonly queued = new Map<string, PreloadRecord>();
  private readonly promises = new Map<string, Promise<boolean>>();
  private running = 0;
  private draining = false;
  private readonly concurrency: number;

  public constructor(concurrency = 1) {
    this.concurrency = Math.max(1, Math.trunc(concurrency));
  }

  public enqueue(key: string, run: () => Promise<boolean>): Promise<boolean> {
    const existing = this.promises.get(key);
    if (existing) return existing;
    let resolvePromise: (value: boolean) => void = () => undefined;
    const promise = new Promise<boolean>((resolve) => {
      resolvePromise = resolve;
    });
    this.promises.set(key, promise);
    this.queued.set(key, { run, resolve: resolvePromise });
    void this.drain();
    return promise;
  }

  /** Drops work that has not reached the worker yet. Active work is shared. */
  public clear(): void {
    for (const [key, record] of this.queued) {
      record.resolve(false);
      this.promises.delete(key);
    }
    this.queued.clear();
  }

  public stats(): MidiPreloadStats {
    return { queued: this.queued.size, inFlight: this.running };
  }

  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try {
      while (this.running < this.concurrency && this.queued.size > 0) {
        const next = this.queued.entries().next().value as
          [string, PreloadRecord] | undefined;
        if (!next) break;
        const [key, record] = next;
        this.queued.delete(key);
        this.running += 1;
        void record
          .run()
          .then(
            (value) => record.resolve(value),
            () => record.resolve(false),
          )
          .finally(() => {
            this.running -= 1;
            this.promises.delete(key);
            void this.drain();
          });
      }
    } finally {
      this.draining = false;
    }
  }
}

export class BrowserMidiPlayer {
  private current: NormalizedMidi | undefined;
  private rawMidi: Uint8Array | undefined;
  private sourceHash = "";
  private currentMidiUrl = "";
  private notes: Note[] = [];
  private audio: AudioContext | undefined;
  private master: GainNode | undefined;
  private limiter: DynamicsCompressorNode | undefined;
  private masterConnected = false;
  private scheduled: AudioNodePair[] = [];
  private bufferSource: AudioBufferSourceNode | undefined;
  private sourceGain: GainNode | undefined;
  private crossfadeMs = 0;
  private timer: number | undefined;
  private startedAt = 0;
  private positionAtStart = 0;
  private rendered: RenderedSong | undefined;
  private worker: Worker | undefined;
  private workerReady: Promise<void> | undefined;
  private workerReadyReject: ((reason?: unknown) => void) | undefined;
  private soundfont: Uint8Array | undefined;
  private soundfontRequest: Promise<void> | undefined;
  private soundfontWorker: Worker | undefined;
  private readonly renderCache = new MidiRenderCache();
  private readonly renderInFlight = new Map<string, Promise<RenderedPcm>>();
  private readonly preloadQueue = new MidiPreloadQueue();
  private preloadGeneration = 0;
  private readonly operationGate = new MidiOperationGate();
  private requestId = 0;
  private readonly pending = new Map<number, PendingRequest>();
  private state: WebMidiSnapshot = { ...initial };
  private settings: WebMidiSettings = {
    tempo: initial.tempo,
    transpose: initial.transpose,
    instrument: initial.instrument,
  };
  private readonly listeners = new Set<() => void>();
  private readonly settingsListeners = new Set<() => void>();
  private readonly endedListeners = new Set<() => void>();

  public constructor(
    private readonly loadSoundfont: SoundfontLoader = () =>
      getDistributedAssetManager().getStore().getBytes(SOUND_FONT_CODE),
  ) {}

  // React's external-store contract requires a stable snapshot reference
  // until a patch actually changes the store.
  public snapshot = (): WebMidiSnapshot => this.state;
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  /** Settings-only store; unlike subscribe(), it never fires for position ticks. */
  public settingsSnapshot = (): WebMidiSettings => this.settings;
  public subscribeSettings = (listener: () => void): (() => void) => {
    this.settingsListeners.add(listener);
    return () => this.settingsListeners.delete(listener);
  };
  public subscribeEnded = (listener: () => void): (() => void) => {
    this.endedListeners.add(listener);
    return () => this.endedListeners.delete(listener);
  };

  public async load(
    songId: string,
    title: string,
    midi: NormalizedMidi,
    options: {
      rawMidi?: Uint8Array;
      sourceHash?: string;
      midiUrl?: string;
      /** Detected tempo from the PDF metadata (gyschordweb _tempoByPdfHref). */
      tempo?: number;
      /** A/B crossfade: keep the previous playlist song audible while this
       * song's buffer renders. `play()` fades it out instead of cutting. */
      keepPlaying?: boolean;
    } = {},
  ): Promise<boolean> {
    this.cancelPreloads();
    const generation = this.operationGate.next();
    if (!options.keepPlaying || this.crossfadeMs <= 0) await this.stopAudio();
    if (!this.operationGate.isCurrent(generation)) return false;
    const tempo =
      options.tempo !== undefined
        ? clampTempo(options.tempo)
        : savedMidiPreferences.tempo === undefined && !this.state.songId
          ? Math.round(midi.tempo)
          : this.state.tempo;
    this.current = midi;
    this.rawMidi = options.rawMidi?.slice();
    this.sourceHash = options.sourceHash ?? "";
    this.currentMidiUrl = options.midiUrl ?? this.currentMidiUrl;
    if (options.midiUrl) this.currentMidiUrl = options.midiUrl;
    else if (!this.currentMidiUrl)
      this.currentMidiUrl = `midi:${songId}:${this.sourceHash}`;
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
      tempo,
      transpose: this.state.transpose,
      backend: "idle",
      loadingProgress: 0,
      error: undefined,
    });
    return true;
  }

  /** Compatibility with gyschordweb MidiEngine API */
  public isPlaying(): boolean {
    return this.state.status === "playing";
  }
  public isLoading(): boolean {
    return this.state.status === "loading";
  }
  public getDuration(): number {
    return this.state.duration;
  }
  public getTime(): number {
    if (this.state.status === "playing" && this.audio) {
      const elapsed = this.audio.currentTime - this.startedAt;
      return Math.min(this.state.duration, this.positionAtStart + elapsed);
    }
    return this.state.position;
  }
  public getCurrentMidiUrl(): string {
    return this.currentMidiUrl;
  }
  public getTempoRate(): number {
    const base = this.current?.tempo ?? this.state.tempo;
    if (!Number.isFinite(base) || base <= 0) return 1;
    return this.state.tempo / base;
  }
  public async hasPreloaded(
    sourceHash: string,
    transpose: number,
    instrument: number,
    tempo?: number,
  ): Promise<boolean> {
    const sampleRate = this.audio?.sampleRate ?? 44_100;
    const key = midiRenderKey(
      sourceHash,
      clampTempo(tempo ?? this.state.tempo),
      clampTranspose(transpose),
      clampInstrument(instrument),
      sampleRate,
    );
    if (this.rendered?.key === key) return true;
    if (this.renderInFlight.has(key)) return true;
    const cached = await this.renderCache.get(key);
    return Boolean(cached);
  }
  /** Synchronous fast-path check used by viewer-core generation gate */
  public hasPreloadedSync(
    sourceHash: string,
    transpose: number,
    instrument: number,
    tempo?: number,
  ): boolean {
    const sampleRate = this.audio?.sampleRate ?? 44_100;
    const key = midiRenderKey(
      sourceHash,
      clampTempo(tempo ?? this.state.tempo),
      clampTranspose(transpose),
      clampInstrument(instrument),
      sampleRate,
    );
    if (this.rendered?.key === key) return true;
    if (this.renderInFlight.has(key)) return true;
    return false;
  }
  public cancelPreload(): void {
    this.cancelPreloads();
  }
  public async resumeContext(): Promise<void> {
    try {
      await this.ensureAudio().resume();
    } catch {
      // Private browsing or suspended context must not block UI
    }
  }
  public getCurrentTranspose(): number {
    return this.state.transpose;
  }
  public getCurrentInstrument(): number {
    return this.state.instrument;
  }

  public async play(): Promise<void> {
    if (!this.current || !this.state.songId)
      throw new Error("MIDI is not loaded");
    const generation = this.operationGate.next();
    const audio = this.ensureAudio();
    await audio.resume();
    if (!this.operationGate.isCurrent(generation)) return;
    const position = Math.min(this.state.position, this.state.duration);

    if (this.rawMidi && typeof Worker !== "undefined") {
      try {
        this.patch({
          status: "loading",
          backend: "fluidsynth",
          loadingProgress: 8,
          error: undefined,
        });
        const rendered = await this.ensureRendered(generation);
        throwIfStale(this.operationGate, generation);
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
        if (error instanceof StaleMidiOperation) return;
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
    if (!this.operationGate.isCurrent(generation)) return;
    this.positionAtStart = position;
    this.startedAt = audio.currentTime;
    this.scheduleOscillator(position);
    this.patch({ status: "playing", backend: "oscillator", error: undefined });
    this.startTimer();
  }

  public async pause(): Promise<void> {
    if (this.state.status !== "playing") return;
    this.operationGate.next();
    this.updatePositionFromClock();
    await this.stopAudio();
    this.patch({ status: "paused" });
  }

  public async stop(): Promise<void> {
    this.operationGate.next();
    await this.stopAudio();
    if (this.state.songId) this.patch({ status: "stopped", position: 0 });
  }

  public async seek(position: number): Promise<void> {
    const generation = this.operationGate.next();
    const next = Math.max(0, Math.min(this.state.duration, position));
    const playing = this.state.status === "playing";
    if (playing) this.updatePositionFromClock();
    await this.stopAudio();
    if (!this.operationGate.isCurrent(generation)) return;
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
    this.cancelPreloads();
    const generation = this.operationGate.next();
    if (wasPlaying) this.updatePositionFromClock();
    await this.stopAudio();
    if (!this.operationGate.isCurrent(generation)) return;
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
    this.cancelPreloads();
    const generation = this.operationGate.next();
    if (wasPlaying) this.updatePositionFromClock();
    await this.stopAudio();
    if (!this.operationGate.isCurrent(generation)) return;
    this.rendered = undefined;
    this.patch({
      transpose: next,
      status: wasPlaying ? "paused" : this.state.status,
    });
    if (wasPlaying) await this.play();
  }

  public async setInstrument(instrument: number): Promise<void> {
    const next = Math.max(-1, Math.min(127, Math.trunc(instrument)));
    const wasPlaying = this.state.status === "playing";
    this.cancelPreloads();
    const generation = this.operationGate.next();
    if (wasPlaying) this.updatePositionFromClock();
    await this.stopAudio();
    if (!this.operationGate.isCurrent(generation)) return;
    this.rendered = undefined;
    this.patch({
      instrument: next,
      status: wasPlaying ? "paused" : this.state.status,
    });
    if (wasPlaying) await this.play();
  }

  public destroy(): void {
    this.cancelPreloads();
    this.operationGate.next();
    void this.stopAudio();
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timer);
      pending.reject(new Error("MIDI player destroyed"));
    }
    this.pending.clear();
    this.worker?.terminate();
    this.worker = undefined;
    this.workerReadyReject?.(new Error("MIDI player destroyed"));
    this.workerReadyReject = undefined;
    this.workerReady = undefined;
    void this.audio?.close();
    this.audio = undefined;
  }

  /**
   * Render a neighbouring song into the bounded PCM cache without changing
   * the current song, position, or React-facing player snapshot. The request
   * is serialised because two FluidSynth renders at once are substantially
   * more expensive on phones and can trigger memory pressure.
   */
  public async preload(request: MidiPreloadRequest): Promise<boolean> {
    if (
      typeof window === "undefined" ||
      typeof Worker === "undefined" ||
      !request.sourceHash ||
      request.rawMidi.byteLength === 0
    )
      return false;
    const tempo = clampTempo(request.tempo ?? this.state.tempo);
    const transpose = clampTranspose(request.transpose ?? this.state.transpose);
    const instrument = clampInstrument(
      request.instrument ?? this.state.instrument,
    );
    const sampleRate = this.audio?.sampleRate ?? 44_100;
    const key = midiRenderKey(
      request.sourceHash,
      tempo,
      transpose,
      instrument,
      sampleRate,
    );
    if (await this.renderCache.get(key)) return true;
    const generation = this.preloadGeneration;
    return this.preloadQueue.enqueue(key, async () => {
      if (generation !== this.preloadGeneration) return false;
      try {
        await this.renderPcm({
          rawMidi: request.rawMidi,
          sourceHash: request.sourceHash,
          sourceTempo: request.midi.tempo,
          tempo,
          transpose,
          instrument,
          sampleRate,
          announceProgress: false,
        });
        return true;
      } catch (error) {
        const context = [request.songId, request.title]
          .filter(Boolean)
          .join(" · ");
        recordDiagnostic(
          "info",
          "midi.preload",
          new Error(
            `${context || "neighbour"}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          ),
        );
        return false;
      }
    });
  }

  /** Warm several neighbours while retaining one shared serial render queue. */
  public preloadMultiple(
    requests: readonly MidiPreloadRequest[],
  ): Promise<boolean[]> {
    return Promise.all(requests.map((request) => this.preload(request)));
  }

  public preloadStats(): MidiPreloadStats {
    return this.preloadQueue.stats();
  }

  public cancelPreloads(): void {
    this.preloadGeneration += 1;
    this.preloadQueue.clear();
  }

  /** gyschordweb crossfadePrefs: ms of gapless overlap on song switches. */
  public setCrossfadeMs(milliseconds: number): void {
    this.crossfadeMs = Math.max(0, Math.min(10_000, Math.trunc(milliseconds)));
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
    if (
      !this.limiter &&
      typeof this.audio.createDynamicsCompressor === "function"
    ) {
      this.limiter = this.audio.createDynamicsCompressor();
      // Mirror gyschordweb MidiEngine limiter as safety net (render already at 0.94)
      this.limiter.threshold.value = -0.3;
      this.limiter.ratio.value = 20;
      this.limiter.attack.value = 0.002;
      this.limiter.knee.value = 0.5;
      this.limiter.release.value = 0.05;
    }
    if (!this.masterConnected) {
      if (this.limiter) {
        this.master.connect(this.limiter);
        this.limiter.connect(this.audio.destination);
      } else {
        this.master.connect(this.audio.destination);
      }
      this.masterConnected = true;
    }
    return this.audio;
  }

  private async ensureRendered(generation: number): Promise<RenderedSong> {
    if (!this.rawMidi || !this.audio)
      throw new Error("Raw MIDI bytes are unavailable");
    const rawMidi = this.rawMidi.slice();
    const sourceHash = this.sourceHash;
    const currentTempo = this.current?.tempo ?? 100;
    const tempo = this.state.tempo;
    const transpose = this.state.transpose;
    const instrument = this.state.instrument;
    const audioSampleRate = this.audio.sampleRate;
    throwIfStale(this.operationGate, generation);
    const key = midiRenderKey(
      sourceHash,
      tempo,
      transpose,
      instrument,
      audioSampleRate,
    );
    if (this.rendered?.key === key) return this.rendered;
    this.patch({ loadingProgress: 34 });
    const pcm = await this.renderPcm({
      rawMidi,
      sourceHash,
      sourceTempo: currentTempo,
      tempo,
      transpose,
      instrument,
      sampleRate: audioSampleRate,
      announceProgress: true,
    });
    throwIfStale(this.operationGate, generation);
    const buffer = this.audio.createBuffer(2, pcm.left.length, pcm.sampleRate);
    buffer.getChannelData(0).set(pcm.left);
    buffer.getChannelData(1).set(pcm.right);
    this.rendered = { key, buffer };
    this.patch({ loadingProgress: 94 });
    return this.rendered;
  }

  private async renderPcm(options: {
    rawMidi: Uint8Array;
    sourceHash: string;
    sourceTempo: number;
    tempo: number;
    transpose: number;
    instrument: number;
    sampleRate: number;
    announceProgress: boolean;
  }): Promise<RenderedPcm> {
    const key = midiRenderKey(
      options.sourceHash,
      options.tempo,
      options.transpose,
      options.instrument,
      options.sampleRate,
    );
    const cached = await this.renderCache.get(key);
    if (cached) return cached;
    const existing = this.renderInFlight.get(key);
    if (existing) return existing;
    const request = (async () => {
      const secondCheck = await this.renderCache.get(key);
      if (secondCheck) return secondCheck;
      const worker = await this.ensureWorker();
      await this.ensureSoundfont(worker, options.announceProgress);
      if (options.announceProgress) this.patch({ loadingProgress: 34 });
      const tempoRate = options.tempo / Math.max(30, options.sourceTempo);
      const message = await this.request(worker, {
        type: "render",
        // The worker owns this copy; never transfer the caller's cache bytes.
        midiBuffer: options.rawMidi.slice().buffer,
        sampleRate: options.sampleRate,
        transpose: options.transpose,
        instrument: options.instrument,
        tempoRate,
      });
      if (message.type !== "rendered" || !message.left || !message.right)
        throw new Error(message.error ?? "FluidSynth did not return audio");
      const sampleRate = message.sampleRate ?? options.sampleRate;
      const length = Math.min(message.left.length, message.right.length);
      const pcm: RenderedPcm = {
        sampleRate,
        left: message.left.slice(0, length),
        right: message.right.slice(0, length),
      };
      await this.renderCache.put(key, pcm);
      return pcm;
    })();
    this.renderInFlight.set(key, request);
    try {
      return await request;
    } finally {
      if (this.renderInFlight.get(key) === request)
        this.renderInFlight.delete(key);
    }
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
      const worker = this.worker;
      worker.addEventListener("error", () => {
        if (this.worker !== worker) return;
        this.worker = undefined;
        this.workerReadyReject?.(new Error("MIDI worker crashed"));
        this.workerReadyReject = undefined;
        this.workerReady = undefined;
        this.soundfontWorker = undefined;
        this.soundfontRequest = undefined;
        for (const pending of this.pending.values())
          pending.reject(new Error("MIDI worker crashed"));
        this.pending.clear();
        worker.terminate();
      });
    }
    this.workerReady ??= new Promise<void>((resolve, reject) => {
      this.workerReadyReject = reject;
      const timer = window.setTimeout(() => {
        this.workerReadyReject = undefined;
        this.workerReady = undefined;
        reject(new Error("MIDI worker startup timed out"));
      }, 30_000);
      const onReady = (event: MessageEvent<WorkerMessage>) => {
        if (event.data.type !== "ready") return;
        window.clearTimeout(timer);
        this.workerReadyReject = undefined;
        this.worker?.removeEventListener("message", onReady as EventListener);
        resolve();
      };
      this.worker?.addEventListener("message", onReady as EventListener);
      this.worker?.postMessage({ type: "init" });
    });
    try {
      await this.workerReady;
    } catch (error) {
      this.workerReadyReject = undefined;
      this.workerReady = undefined;
      throw error;
    }
    return this.worker;
  }

  private async ensureSoundfont(
    worker: Worker,
    announceProgress = true,
  ): Promise<void> {
    if (this.soundfontRequest && this.soundfontWorker === worker)
      return this.soundfontRequest;
    this.soundfontWorker = worker;
    this.soundfontRequest = (async () => {
      if (!this.soundfont) {
        this.soundfont = await this.loadSoundfont();
        if (!this.soundfont)
          throw new Error(
            "GeneralUser-GS SoundFont belum terpasang. Unduh melalui Manajemen Aset.",
          );
        if (this.soundfont.byteLength < 1_000_000)
          throw new Error("GeneralUser-GS SoundFont is incomplete");
      }
      if (announceProgress)
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
    // A/B deck parity: when a previous source is still playing, overlap it
    // with a gain crossfade instead of cutting it instantly (gapless).
    const previous = this.bufferSource;
    const previousGain = this.sourceGain;
    if (previous && this.crossfadeMs > 0 && this.state.status === "playing") {
      previous.onended = null;
      const now = audio.currentTime;
      const fade = this.crossfadeMs / 1000;
      if (previousGain) {
        try {
          previousGain.gain.cancelScheduledValues(now);
          previousGain.gain.setValueAtTime(previousGain.gain.value, now);
          previousGain.gain.linearRampToValueAtTime(0.0001, now + fade);
          previous.stop(now + fade + 0.05);
        } catch {
          // Already stopped.
        }
      }
    } else {
      void this.stopAudio();
    }
    const source = audio.createBufferSource();
    source.buffer = buffer;
    const gain = audio.createGain();
    gain.gain.value = previous && this.crossfadeMs > 0 ? 0.0001 : 1;
    source.connect(gain).connect(this.master!);
    if (previous && this.crossfadeMs > 0) {
      const now = audio.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(1, now + this.crossfadeMs / 1000);
    }
    this.sourceGain = gain;
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
      const program =
        this.state.instrument >= 0 ? this.state.instrument : note.program;
      oscillator.type = waveformForProgram(program);
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
      if (this.sourceGain) {
        this.sourceGain.disconnect();
        this.sourceGain = undefined;
      }
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
    const settingsChanged =
      "tempo" in next || "transpose" in next || "instrument" in next;
    this.state = { ...this.state, ...next };
    if (settingsChanged) {
      this.settings = {
        tempo: this.state.tempo,
        transpose: this.state.transpose,
        instrument: this.state.instrument,
      };
      for (const listener of this.settingsListeners) listener();
    }
    if (
      typeof window !== "undefined" &&
      ("volume" in next ||
        "muted" in next ||
        "tempo" in next ||
        "transpose" in next ||
        "instrument" in next)
    ) {
      try {
        window.localStorage.setItem(
          "gys-midi-preferences-v1",
          JSON.stringify({
            volume: this.state.volume,
            muted: this.state.muted,
            tempo: this.state.tempo,
            transpose: this.state.transpose,
            instrument: this.state.instrument,
          }),
        );
      } catch {
        // Private browsing and quota failures must not block playback.
      }
    }
    // MediaSession + Wake Lock parity lives in media-session.ts (global bridge).
    for (const listener of this.listeners) listener();
  }
}

function clampTempo(value: number): number {
  return Math.max(30, Math.min(220, Math.round(value)));
}

function clampTranspose(value: number): number {
  return Math.max(-24, Math.min(24, Math.trunc(value)));
}

function clampInstrument(value: number): number {
  return Math.max(-1, Math.min(127, Math.trunc(value)));
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
