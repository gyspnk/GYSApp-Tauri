import { RenderCache } from "@gys/domain";

const MAGIC = Uint8Array.from([71, 89, 83, 77, 73, 68, 49, 0]);
const HEADER_BYTES = 16;

export type RenderedPcm = {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
};

function encode(value: RenderedPcm): Uint8Array {
  if (
    !Number.isInteger(value.sampleRate) ||
    value.sampleRate <= 0 ||
    value.left.length !== value.right.length
  )
    throw new Error("MIDI render PCM shape is invalid");
  const bytes = new Uint8Array(
    HEADER_BYTES + value.left.length * Float32Array.BYTES_PER_ELEMENT * 2,
  );
  bytes.set(MAGIC);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, value.sampleRate, true);
  view.setUint32(12, value.left.length, true);
  bytes.set(
    new Uint8Array(
      value.left.buffer,
      value.left.byteOffset,
      value.left.byteLength,
    ),
    HEADER_BYTES,
  );
  bytes.set(
    new Uint8Array(
      value.right.buffer,
      value.right.byteOffset,
      value.right.byteLength,
    ),
    HEADER_BYTES + value.left.byteLength,
  );
  return bytes;
}

function decode(bytes: Uint8Array): RenderedPcm {
  if (
    bytes.byteLength < HEADER_BYTES ||
    !MAGIC.every((byte, index) => bytes[index] === byte)
  )
    throw new Error("MIDI render cache header is invalid");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(8, true);
  const length = view.getUint32(12, true);
  const expected = HEADER_BYTES + length * Float32Array.BYTES_PER_ELEMENT * 2;
  if (!sampleRate || expected !== bytes.byteLength)
    throw new Error("MIDI render cache payload is invalid");
  const leftStart = bytes.byteOffset + HEADER_BYTES;
  const rightStart = leftStart + length * Float32Array.BYTES_PER_ELEMENT;
  return {
    sampleRate,
    left: new Float32Array(bytes.buffer, leftStart, length).slice(),
    right: new Float32Array(bytes.buffer, rightStart, length).slice(),
  };
}

/** Bounded in-memory PCM cache shared by every hymn loaded in this tab. */
export class MidiRenderCache {
  private readonly cache: RenderCache;

  public constructor(limitBytes = 96 * 1024 * 1024) {
    this.cache = new RenderCache(limitBytes);
  }

  public async get(key: string): Promise<RenderedPcm | undefined> {
    const bytes = await this.cache.get(key);
    if (!bytes) return undefined;
    try {
      return decode(bytes);
    } catch {
      await this.cache.remove(key);
      return undefined;
    }
  }

  public async put(key: string, value: RenderedPcm): Promise<void> {
    await this.cache.put(key, encode(value));
  }

  public async pin(key: string, pinned: boolean): Promise<void> {
    await this.cache.pin(key, pinned);
  }

  public stats(): { bytes: number; entries: number; limit: number } {
    return this.cache.stats();
  }
}
