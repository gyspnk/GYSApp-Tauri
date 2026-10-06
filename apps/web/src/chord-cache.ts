import {
  ChordDocumentV2Schema,
  type ChordDocumentV2,
  type ChordRef,
  type PlatformServices,
} from "@gys/contracts";
import type { ChordCache } from "@gys/domain";

type Entry = {
  format?: 2;
  noteAligned?: boolean;
  ref: ChordRef;
  key: string;
  bytes: number;
  pinned: boolean;
  lastAccess: number;
};

const INDEX_KEY = "gys-chord-cache-index-v1";
const MAX_BYTES = 25 * 1024 * 1024;

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as BufferSource,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export class BrowserChordCache implements ChordCache {
  private disposed = false;
  private index = new Map<string, Entry>();
  private loaded = false;
  private loadPromise: Promise<void> | undefined;
  private sequence = 0;
  private mutation = Promise.resolve();
  private accessTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly documents = new Map<
    string,
    { entry: Entry; document: ChordDocumentV2 }
  >();
  private readonly reads = new Map<
    string,
    Promise<ChordDocumentV2 | undefined>
  >();
  private documentBytes = 0;

  private forget(songId: string): void {
    const cached = this.documents.get(songId);
    if (cached) this.documentBytes -= cached.entry.bytes;
    this.documents.delete(songId);
  }

  private mutate<T>(action: () => Promise<T>): Promise<T> {
    const next = this.mutation.then(() => {
      if (this.disposed) throw new Error("Chord cache is disposed");
      return action();
    });
    this.mutation = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private touch(entry: Entry): void {
    if (this.disposed) return;
    entry.lastAccess = ++this.sequence;
    if (this.accessTimer !== undefined) return;
    this.accessTimer = setTimeout(() => {
      this.accessTimer = undefined;
      // Access order is advisory; a storage failure must not interrupt reading.
      void this.mutate(() => this.persist()).catch(() => undefined);
    }, 1000);
  }

  public constructor(private readonly platform: PlatformServices) {}

  private async ensureLoaded(): Promise<void> {
    if (this.disposed) throw new Error("Chord cache is disposed");
    if (this.loaded) return;
    if (!this.loadPromise) {
      this.loadPromise = (async () => {
        const stored =
          await this.platform.keyValue.get<Record<string, Entry>>(INDEX_KEY);
        if (stored) {
          for (const [songId, entry] of Object.entries(stored))
            this.index.set(songId, entry);
          this.sequence = Math.max(
            0,
            ...[...this.index.values()].map((entry) => entry.lastAccess),
          );
        }
        this.loaded = true;
      })().finally(() => {
        this.loadPromise = undefined;
      });
    }
    await this.loadPromise;
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
    const warm = this.documents.get(songId);
    if (warm?.entry === entry) {
      this.touch(entry);
      this.documents.delete(songId);
      this.documents.set(songId, warm);
      return warm.document;
    }
    const existing = this.reads.get(songId);
    if (existing) return existing;
    const read = this.readDocument(songId, entry);
    this.reads.set(songId, read);
    try {
      return await read;
    } finally {
      if (this.reads.get(songId) === read) this.reads.delete(songId);
    }
  }

  private async readDocument(
    songId: string,
    entry: Entry,
  ): Promise<ChordDocumentV2 | undefined> {
    const bytes = await this.platform.blobs.get(entry.key);
    try {
      if (
        !bytes ||
        (entry.format === 2 &&
          (bytes.byteLength !== entry.ref.size ||
            (await sha256(bytes)).toLowerCase() !==
              entry.ref.sha256.toLowerCase()))
      )
        throw new Error("cached chord integrity mismatch");
      const document = ChordDocumentV2Schema.parse(
        JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      );
      if (this.index.get(songId) === entry) {
        entry.noteAligned = !("sourceCommit" in document);
        this.touch(entry);
        this.forget(songId);
        if (entry.bytes <= 1024 * 1024) {
          this.documents.set(songId, { entry, document });
          this.documentBytes += entry.bytes;
          while (this.documents.size > 32 || this.documentBytes > 1024 * 1024)
            this.forget(this.documents.keys().next().value!);
        }
      }
      return document;
    } catch {
      // A read of an older revision must never remove a concurrent update.
      await this.mutate(async () => {
        if (this.index.get(songId) !== entry) return;
        this.index.delete(songId);
        this.forget(songId);
        await this.persist();
        await this.platform.blobs.remove(entry.key);
      });
      return undefined;
    }
  }

  public async isCurrent(ref: ChordRef): Promise<boolean> {
    await this.ensureLoaded();
    const entry = this.index.get(ref.songId);
    return Boolean(
      entry?.format === 2 &&
      entry.ref.sha256 === ref.sha256 &&
      entry.ref.size === ref.size &&
      (entry.ref.sourceCommit === ref.sourceCommit || entry.noteAligned),
    );
  }

  public async putAtomic(
    ref: ChordRef,
    document: ChordDocumentV2,
    bytes: Uint8Array,
  ): Promise<void> {
    await this.ensureLoaded();
    if (bytes.byteLength > MAX_BYTES)
      throw new Error("chord exceeds cache limit");
    await this.mutate(async () => {
      const previous = this.index.get(ref.songId);
      const key = this.key(ref.songId, ref.sha256);
      await this.platform.blobs.putAtomic(key, bytes.slice());
      this.index.set(ref.songId, {
        format: 2,
        noteAligned: !("sourceCommit" in document),
        ref,
        key,
        bytes: bytes.byteLength,
        pinned: previous?.pinned ?? false,
        lastAccess: ++this.sequence,
      });
      this.forget(ref.songId);
      try {
        await this.persist();
      } catch (error) {
        if (previous) this.index.set(ref.songId, previous);
        else this.index.delete(ref.songId);
        if (previous?.key !== key)
          await this.platform.blobs.remove(key).catch(() => undefined);
        throw error;
      }
      // Commit the pointer before deleting the previous known-good payload.
      if (previous && previous.key !== key)
        await this.platform.blobs.remove(previous.key);
      await this.collect();
    });
    if (typeof window !== "undefined")
      window.dispatchEvent(
        new CustomEvent("gys-chords-updated", {
          detail: { songId: ref.songId },
        }),
      );
  }

  public async remove(songId: string): Promise<void> {
    await this.ensureLoaded();
    await this.mutate(async () => {
      const entry = this.index.get(songId);
      if (!entry) return;
      this.index.delete(songId);
      this.forget(songId);
      await this.persist();
      await this.platform.blobs.remove(entry.key);
    });
  }

  public getRef(songId: string): ChordRef | undefined {
    return this.index.get(songId)?.ref;
  }

  public isIntegrityVerified(songId: string): boolean | undefined {
    const entry = this.index.get(songId);
    return entry ? entry.format === 2 : undefined;
  }

  public async pin(songId: string, pinned: boolean): Promise<void> {
    await this.ensureLoaded();
    await this.mutate(async () => {
      const entry = this.index.get(songId);
      if (!entry || entry.pinned === pinned) return;
      entry.pinned = pinned;
      await this.persist();
    });
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
    await this.mutate(() => this.collect());
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    clearTimeout(this.accessTimer);
    this.accessTimer = undefined;
    await Promise.allSettled([
      ...(this.loadPromise ? [this.loadPromise] : []),
      ...this.reads.values(),
    ]);
    await this.mutation;
    this.documents.clear();
    this.index.clear();
    this.documentBytes = 0;
  }

  private async collect(): Promise<void> {
    let bytes = [...this.index.values()].reduce(
      (sum, entry) => sum + entry.bytes,
      0,
    );
    if (bytes <= MAX_BYTES) return;
    const evicted: Entry[] = [];
    const candidates = [...this.index.entries()]
      .filter(([, entry]) => !entry.pinned)
      .sort(([, left], [, right]) => left.lastAccess - right.lastAccess);
    for (const [songId, entry] of candidates) {
      if (bytes <= MAX_BYTES) break;
      bytes -= entry.bytes;
      this.index.delete(songId);
      this.forget(songId);
      evicted.push(entry);
    }
    if (!evicted.length) return;
    await this.persist();
    await Promise.all(
      evicted.map((entry) => this.platform.blobs.remove(entry.key)),
    );
  }
}
