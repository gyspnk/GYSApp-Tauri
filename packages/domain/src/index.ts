import type { ChordDocumentV2, ChordRef } from "@gys/contracts";

type CacheEntry = {
  ref: ChordRef;
  document: ChordDocumentV2;
  bytes: number;
  pinned: boolean;
  lastAccess: number;
};

export type ChordCacheStats = {
  bytes: number;
  entries: number;
  pinned: number;
  limit: number;
};

export class MemoryChordCache {
  private readonly entries = new Map<string, CacheEntry>();
  private usedBytes = 0;
  private sequence = 0;

  public constructor(private readonly limitBytes = 25 * 1024 * 1024) {}

  public async get(songId: string): Promise<ChordDocumentV2 | undefined> {
    const entry = this.entries.get(songId);
    if (!entry) return undefined;
    entry.lastAccess = ++this.sequence;
    return entry.document;
  }

  public async putAtomic(
    ref: ChordRef,
    document: ChordDocumentV2,
    bytes: Uint8Array,
  ): Promise<void> {
    if (bytes.byteLength > this.limitBytes)
      throw new Error("chord exceeds cache limit");
    const previous = this.entries.get(ref.songId);
    if (previous) this.usedBytes -= previous.bytes;
    this.entries.set(ref.songId, {
      ref,
      document,
      bytes: bytes.byteLength,
      pinned: previous?.pinned ?? false,
      lastAccess: ++this.sequence,
    });
    this.usedBytes += bytes.byteLength;
    this.gc();
  }

  public async remove(songId: string): Promise<void> {
    const previous = this.entries.get(songId);
    if (previous) this.usedBytes -= previous.bytes;
    this.entries.delete(songId);
  }

  public getRef(songId: string): ChordRef | undefined {
    return this.entries.get(songId)?.ref;
  }

  public async pin(songId: string, pinned: boolean): Promise<void> {
    const entry = this.entries.get(songId);
    if (entry) entry.pinned = pinned;
  }

  public async stats(): Promise<ChordCacheStats> {
    let pinned = 0;
    for (const entry of this.entries.values()) if (entry.pinned) pinned += 1;
    return {
      bytes: this.usedBytes,
      entries: this.entries.size,
      pinned,
      limit: this.limitBytes,
    };
  }

  public async gc(): Promise<void> {
    while (this.usedBytes > this.limitBytes) {
      const candidate = [...this.entries.values()]
        .filter((entry) => !entry.pinned)
        .sort((left, right) => left.lastAccess - right.lastAccess)[0];
      if (!candidate) break;
      this.usedBytes -= candidate.bytes;
      this.entries.delete(candidate.ref.songId);
    }
  }
}

export interface AudibleSession {
  kind: "midi" | "speech";
  id: string;
  pause(): Promise<void>;
  stop(): Promise<void>;
}

export class MediaCoordinator {
  private current: AudibleSession | undefined;

  public async start(session: AudibleSession): Promise<void> {
    if (this.current?.id === session.id) return;
    if (this.current) await this.current.pause();
    this.current = session;
  }

  public async stop(id?: string): Promise<void> {
    if (!this.current || (id !== undefined && this.current.id !== id)) return;
    const active = this.current;
    this.current = undefined;
    await active.stop();
  }

  public active(): AudibleSession | undefined {
    return this.current;
  }
}

export type RawMidiEvent =
  | {
      tick: number;
      type: "noteOn";
      note: number;
      velocity: number;
      channel?: number;
    }
  | { tick: number; type: "noteOff"; note: number; channel?: number }
  | { tick: number; type: "program"; program: number; channel?: number };

export type RawMidi = {
  ppq: number;
  tempo: number;
  tracks: Array<{ channel: number; events: RawMidiEvent[] }>;
};

export type NormalizedMidiEvent = RawMidiEvent & { channel: number };
export type NormalizedMidi = {
  ppq: number;
  tempo: number;
  events: NormalizedMidiEvent[];
};

const MIDI_MIN_TEMPO = 30;
const MIDI_MAX_TEMPO = 220;

export function normalizeMidi(midi: RawMidi): NormalizedMidi {
  const events = midi.tracks.flatMap((track) =>
    track.events.map((event) => ({
      ...event,
      channel: Math.max(0, Math.min(15, event.channel ?? track.channel)),
    })),
  );
  events.sort((left, right) => left.tick - right.tick);
  return {
    ppq: Math.max(1, Math.trunc(midi.ppq)),
    tempo: Math.max(MIDI_MIN_TEMPO, Math.min(MIDI_MAX_TEMPO, midi.tempo)),
    events,
  };
}

export type { ChordDocumentV2, ChordRef };

export * from "./chord-sync.js";
export * from "./bible.js";
export * from "./backup.js";
export * from "./speech.js";
