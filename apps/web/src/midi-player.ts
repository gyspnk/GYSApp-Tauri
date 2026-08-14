import type { NormalizedMidi, NormalizedMidiEvent } from "@gys/domain";

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
  error?: string;
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

const initial: WebMidiSnapshot = {
  status: "idle",
  duration: 0,
  position: 0,
  volume: 0.7,
  muted: false,
  tempo: 100,
  transpose: 0,
};

class BrowserMidiPlayer {
  private current: NormalizedMidi | undefined;
  private notes: Note[] = [];
  private audio: AudioContext | undefined;
  private master: GainNode | undefined;
  private scheduled: AudioNodePair[] = [];
  private timer: number | undefined;
  private startedAt = 0;
  private positionAtStart = 0;
  private state: WebMidiSnapshot = { ...initial };
  private readonly listeners = new Set<() => void>();

  // React's external-store contract requires a stable snapshot reference
  // until a patch actually changes the store.
  public snapshot = (): WebMidiSnapshot => this.state;
  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  public async load(
    songId: string,
    title: string,
    midi: NormalizedMidi,
  ): Promise<void> {
    await this.stopAudio();
    this.current = midi;
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
      tempo: midi.tempo,
      transpose: 0,
    });
  }

  public async play(): Promise<void> {
    if (!this.current || !this.state.songId)
      throw new Error("MIDI is not loaded");
    const AudioContextCtor =
      window.AudioContext ??
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioContextCtor)
      throw new Error("Web Audio is unavailable in this browser");
    this.audio ??= new AudioContextCtor();
    await this.audio.resume();
    this.master ??= this.audio.createGain();
    this.master.connect(this.audio.destination);
    await this.stopAudio();
    this.positionAtStart = this.state.position;
    this.startedAt = this.audio.currentTime;
    this.schedule(this.positionAtStart);
    this.patch({ status: "playing" });
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
    this.patch({ status: "stopped", position: 0 });
  }

  public async seek(position: number): Promise<void> {
    const next = Math.max(0, Math.min(this.state.duration, position));
    const playing = this.state.status === "playing";
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
    const next = Math.max(30, Math.min(220, tempo));
    const wasPlaying = this.state.status === "playing";
    if (wasPlaying) this.updatePositionFromClock();
    await this.stopAudio();
    this.patch({ tempo: next });
    if (wasPlaying) await this.play();
  }

  public async setTranspose(transpose: number): Promise<void> {
    const next = Math.max(-24, Math.min(24, Math.trunc(transpose)));
    const wasPlaying = this.state.status === "playing";
    if (wasPlaying) this.updatePositionFromClock();
    await this.stopAudio();
    this.patch({ transpose: next });
    if (wasPlaying) await this.play();
  }

  private schedule(position: number): void {
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
      if (this.state.position >= this.state.duration - 0.02) {
        void this.stopAudio().then(() =>
          this.patch({ status: "stopped", position: 0 }),
        );
      }
    }, 250);
  }

  private updatePositionFromClock(): void {
    if (this.state.status !== "playing" || !this.audio) return;
    const elapsed =
      (this.audio.currentTime - this.startedAt) *
      (this.state.tempo / (this.current?.tempo ?? this.state.tempo));
    this.patch({
      position: Math.min(this.state.duration, this.positionAtStart + elapsed),
    });
  }

  private async stopAudio(): Promise<void> {
    this.clearTimer();
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
