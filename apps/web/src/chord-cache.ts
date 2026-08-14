import {
  ChordDocumentV2Schema,
  type ChordDocumentV2,
  type ChordRef,
  type PlatformServices,
} from "@gys/contracts";
import type { ChordCache } from "@gys/domain";

type Entry = {
  ref: ChordRef;
  key: string;
  bytes: number;
  pinned: boolean;
  lastAccess: number;
};

const INDEX_KEY = "gys-chord-cache-index-v1";
const MAX_BYTES = 25 * 1024 * 1024;

export class BrowserChordCache implements ChordCache {
  private index = new Map<string, Entry>();
  private loaded = false;
  private sequence = 0;

  public constructor(private readonly platform: PlatformServices) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    const stored =
      await this.platform.keyValue.get<Record<string, Entry>>(INDEX_KEY);
    if (!stored) return;
    for (const [songId, entry] of Object.entries(stored))
      this.index.set(songId, entry);
    this.sequence = Math.max(
      0,
      ...[...this.index.values()].map((entry) => entry.lastAccess),
    );
  }

  private async persist(): Promise<void> {
    await this.platform.keyValue.set(INDEX_KEY, Object.fromEntries(this.index));
  }

  private key(songId: string, sha256: string): string {
    return `chord/${encodeURIComponent(songId)}/${sha256}`;
  }

  public async get(songId: string): Promise<ChordDocumentV2 | undefined> {
    await this.ensureLoaded();
    const entry = this.index.get(songId);
    if (!entry) return undefined;
    const bytes = await this.platform.blobs.get(entry.key);
    if (!bytes) {
      this.index.delete(songId);
      await this.persist();
      return undefined;
    }
    try {
      const document = ChordDocumentV2Schema.parse(
        JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      );
      entry.lastAccess = ++this.sequence;
      await this.persist();
      return document;
    } catch {
      await this.remove(songId);
      return undefined;
    }
  }

  public async putAtomic(
    ref: ChordRef,
    document: ChordDocumentV2,
    bytes: Uint8Array,
  ): Promise<void> {
    await this.ensureLoaded();
    const previous = this.index.get(ref.songId);
    const key = this.key(ref.songId, ref.sha256);
    await this.platform.blobs.putAtomic(
      key,
      new TextEncoder().encode(JSON.stringify(document)),
    );
    this.index.set(ref.songId, {
      ref,
      key,
      bytes: bytes.byteLength,
      pinned: previous?.pinned ?? false,
      lastAccess: ++this.sequence,
    });
    if (previous && previous.key !== key)
      await this.platform.blobs.remove(previous.key);
    await this.persist();
    await this.gc();
  }

  public async remove(songId: string): Promise<void> {
    await this.ensureLoaded();
    const entry = this.index.get(songId);
    if (!entry) return;
    this.index.delete(songId);
    await this.platform.blobs.remove(entry.key);
    await this.persist();
  }

  public getRef(songId: string): ChordRef | undefined {
    return this.index.get(songId)?.ref;
  }

  public async pin(songId: string, pinned: boolean): Promise<void> {
    await this.ensureLoaded();
    const entry = this.index.get(songId);
    if (!entry) return;
    entry.pinned = pinned;
    await this.persist();
  }

  public async stats(): Promise<{
    bytes: number;
    entries: number;
    pinned: number;
    limit: number;
  }> {
    await this.ensureLoaded();
    return {
      bytes: [...this.index.values()].reduce(
        (sum, entry) => sum + entry.bytes,
        0,
      ),
      entries: this.index.size,
      pinned: [...this.index.values()].filter((entry) => entry.pinned).length,
      limit: MAX_BYTES,
    };
  }

  public async gc(): Promise<void> {
    await this.ensureLoaded();
    let bytes = [...this.index.values()].reduce(
      (sum, entry) => sum + entry.bytes,
      0,
    );
    while (bytes > MAX_BYTES) {
      const candidate = [...this.index.entries()]
        .filter(([, entry]) => !entry.pinned)
        .sort(([, left], [, right]) => left.lastAccess - right.lastAccess)[0];
      if (!candidate) break;
      bytes -= candidate[1].bytes;
      this.index.delete(candidate[0]);
      await this.platform.blobs.remove(candidate[1].key);
    }
    await this.persist();
  }
}
