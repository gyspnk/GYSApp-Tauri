export type MidiSong = { id: string; duration: number; sourceHash: string };

export interface MidiAudioBackend {
  load(song: MidiSong): Promise<void>;
  play(position: number): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seek(position: number): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setTempo(tempo: number): Promise<void>;
  setTranspose(transpose: number): Promise<void>;
}

export type MidiStatus =
  "idle" | "loading" | "ready" | "playing" | "paused" | "stopped" | "error";
export type MidiSnapshot = {
  status: MidiStatus;
  songId?: string;
  duration: number;
  position: number;
  volume: number;
  muted: boolean;
  tempo: number;
  transpose: number;
  error: string | undefined;
};

type Listener = (snapshot: MidiSnapshot) => void;

export class MidiSession {
  private current: MidiSong | undefined;
  private state: MidiSnapshot = {
    status: "idle",
    duration: 0,
    position: 0,
    volume: 1,
    muted: false,
    tempo: 100,
    transpose: 0,
    error: undefined,
  };
  private readonly listeners = new Set<Listener>();

  public constructor(private readonly backend: MidiAudioBackend) {}

  public snapshot(): MidiSnapshot {
    return { ...this.state };
  }
  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public async load(song: MidiSong): Promise<void> {
    this.current = song;
    this.patch({
      status: "loading",
      songId: song.id,
      duration: Math.max(0, song.duration),
      position: 0,
      error: undefined,
    });
    try {
      await this.backend.load(song);
      this.patch({ status: "ready" });
    } catch (error) {
      this.patch({
        status: "error",
        error: error instanceof Error ? error.message : "MIDI load failed",
      });
      throw error;
    }
  }

  public async play(): Promise<void> {
    this.requireSong();
    await this.backend.play(this.state.position);
    this.patch({ status: "playing" });
  }

  public async pause(): Promise<void> {
    if (this.state.status !== "playing") return;
    await this.backend.pause();
    this.patch({ status: "paused" });
  }
  public async resume(): Promise<void> {
    if (this.state.status !== "paused") return;
    await this.play();
  }
  public async stop(): Promise<void> {
    if (!this.current) return;
    await this.backend.stop();
    this.patch({ status: "stopped" });
  }

  public async seek(position: number): Promise<void> {
    const next = Math.max(0, Math.min(this.state.duration, position));
    await this.backend.seek(next);
    this.patch({ position: next });
  }

  public updatePosition(position: number): void {
    this.patch({
      position: Math.max(0, Math.min(this.state.duration, position)),
    });
  }

  public async setVolume(volume: number): Promise<void> {
    const next = Math.max(0, Math.min(1, volume));
    await this.backend.setVolume(next);
    this.patch({ volume: next });
  }
  public setMuted(muted: boolean): void {
    this.patch({ muted });
  }
  public async setTempo(tempo: number): Promise<void> {
    const next = Math.max(30, Math.min(220, tempo));
    await this.backend.setTempo(next);
    this.patch({ tempo: next });
  }
  public async setTranspose(transpose: number): Promise<void> {
    const next = Math.max(-24, Math.min(24, Math.trunc(transpose)));
    await this.backend.setTranspose(next);
    this.patch({ transpose: next });
  }

  private requireSong(): MidiSong {
    if (!this.current) throw new Error("MIDI song is not loaded");
    return this.current;
  }
  private patch(next: Partial<MidiSnapshot>): void {
    this.state = { ...this.state, ...next };
    for (const listener of this.listeners) listener(this.snapshot());
  }
}

type RenderEntry = { bytes: Uint8Array; pinned: boolean; lastAccess: number };

export class RenderCache {
  private readonly entries = new Map<string, RenderEntry>();
  private bytes = 0;
  private sequence = 0;
  public constructor(private readonly limitBytes = 96 * 1024 * 1024) {}

  public async get(key: string): Promise<Uint8Array | undefined> {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    entry.lastAccess = ++this.sequence;
    return entry.bytes.slice();
  }
  public async put(key: string, bytes: Uint8Array): Promise<void> {
    const previous = this.entries.get(key);
    if (previous) this.bytes -= previous.bytes.byteLength;
    this.entries.set(key, {
      bytes: bytes.slice(),
      pinned: previous?.pinned ?? false,
      lastAccess: ++this.sequence,
    });
    this.bytes += bytes.byteLength;
    await this.gc();
  }
  public async remove(key: string): Promise<void> {
    const entry = this.entries.get(key);
    if (entry) this.bytes -= entry.bytes.byteLength;
    this.entries.delete(key);
  }
  public async pin(key: string, pinned: boolean): Promise<void> {
    const entry = this.entries.get(key);
    if (entry) entry.pinned = pinned;
  }
  public async gc(): Promise<void> {
    while (this.bytes > this.limitBytes) {
      const candidate = [...this.entries.entries()]
        .filter(([, entry]) => !entry.pinned)
        .sort(([, left], [, right]) => left.lastAccess - right.lastAccess)[0];
      if (!candidate) break;
      this.bytes -= candidate[1].bytes.byteLength;
      this.entries.delete(candidate[0]);
    }
  }
  public stats(): { bytes: number; entries: number; limit: number } {
    return {
      bytes: this.bytes,
      entries: this.entries.size,
      limit: this.limitBytes,
    };
  }
}
