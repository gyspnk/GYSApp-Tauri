export type RenderedPcm = {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
};

type Entry = {
  pcm?: RenderedPcm;
  buffer?: AudioBuffer;
  bytes: number;
  pinned: boolean;
};

function clone(value: RenderedPcm): RenderedPcm {
  return {
    sampleRate: value.sampleRate,
    left: value.left.slice(),
    right: value.right.slice(),
  };
}

/** One bounded LRU owns PCM or its playable buffer, never both for one key. */
export class MidiRenderCache {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;

  public constructor(private readonly limitBytes = 128 * 1024 * 1024) {}

  private entry(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (entry) {
      this.entries.delete(key);
      this.entries.set(key, entry);
    }
    return entry;
  }

  public has(key: string): boolean {
    return Boolean(this.entry(key));
  }

  /** Internal audio code only reads these owned channels. Public get is defensive. */
  public readPcm(key: string): RenderedPcm | undefined {
    const entry = this.entry(key);
    if (entry?.pcm) return entry.pcm;
    const buffer = entry?.buffer;
    return buffer
      ? {
          sampleRate: buffer.sampleRate,
          left: buffer.getChannelData(0),
          right: buffer.getChannelData(1),
        }
      : undefined;
  }

  public async get(key: string): Promise<RenderedPcm | undefined> {
    const value = this.readPcm(key);
    return value ? clone(value) : undefined;
  }

  public getAudioBuffer(key: string): AudioBuffer | undefined {
    return this.entry(key)?.buffer;
  }

  public async put(key: string, value: RenderedPcm): Promise<void> {
    await this.putOwned(key, clone(value));
  }

  /** Take ownership of channels transferred from the render worker without copies. */
  public async putOwned(key: string, value: RenderedPcm): Promise<void> {
    if (
      !Number.isInteger(value.sampleRate) ||
      value.sampleRate <= 0 ||
      value.left.length !== value.right.length
    )
      throw new Error("MIDI render PCM shape is invalid");
    this.store(key, {
      pcm: value,
      bytes: value.left.buffer.byteLength + value.right.buffer.byteLength,
      pinned: false,
    });
  }

  /** Materialization replaces the PCM entry, releasing its redundant channel copies. */
  public putAudioBuffer(
    key: string,
    buffer: AudioBuffer,
    pinned = false,
  ): void {
    this.store(key, {
      buffer,
      bytes:
        buffer.length *
        buffer.numberOfChannels *
        Float32Array.BYTES_PER_ELEMENT,
      pinned,
    });
  }

  private store(key: string, entry: Entry): void {
    const previous = this.entries.get(key);
    this.bytes -= previous?.bytes ?? 0;
    entry.pinned = previous?.pinned || entry.pinned;
    this.entries.delete(key);
    this.entries.set(key, entry);
    this.bytes += entry.bytes;
    this.gc();
  }

  private gc(): void {
    for (const [oldKey, oldEntry] of this.entries) {
      if (this.bytes <= this.limitBytes) break;
      if (oldEntry.pinned) continue;
      this.entries.delete(oldKey);
      this.bytes -= oldEntry.bytes;
    }
  }

  public async pin(key: string, pinned: boolean): Promise<void> {
    const entry = this.entries.get(key);
    if (entry) entry.pinned = pinned;
    if (!pinned) this.gc();
  }

  public stats(): { bytes: number; entries: number; limit: number } {
    return {
      bytes: this.bytes,
      entries: this.entries.size,
      limit: this.limitBytes,
    };
  }
}
