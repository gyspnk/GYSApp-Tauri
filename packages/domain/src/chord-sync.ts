import {
  ChordDocumentV2Schema,
  ChordManifestV1Schema,
  type ChordDocumentV2,
  type ChordManifestV1,
  type ChordRef,
} from "@gys/contracts";
import { MemoryChordCache } from "./index.js";

export type ManifestResult = {
  manifest?: ChordManifestV1;
  etag?: string;
  notModified?: boolean;
};
export type ChordFetchResult = { bytes: Uint8Array; document: unknown };

export interface ChordUpstream {
  getManifest(etag?: string, signal?: AbortSignal): Promise<ManifestResult>;
  fetchChord(ref: ChordRef, signal?: AbortSignal): Promise<ChordFetchResult>;
}

export interface ChordCache {
  get(songId: string): Promise<ChordDocumentV2 | undefined>;
  putAtomic(
    ref: ChordRef,
    document: ChordDocumentV2,
    bytes: Uint8Array,
  ): Promise<void>;
  remove(songId: string): Promise<void>;
  pin(songId: string, pinned: boolean): Promise<void>;
  stats(): Promise<unknown>;
  gc(): Promise<void>;
  getRef?(songId: string): ChordRef | undefined;
  isIntegrityVerified?(songId: string): boolean | undefined;
  /** Metadata-only startup check; opening a chord still verifies its stored bytes. */
  isCurrent?(ref: ChordRef): Promise<boolean>;
  dispose?(): Promise<void>;
}

const MANIFEST_TTL_MS = 6 * 60 * 60 * 1000;
const MANIFEST_COOLDOWN_MS = 60 * 1000;
const NEGATIVE_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

export class ChordIntegrityError extends Error {
  public constructor(message: string) {
    super(`chord integrity error: ${message}`);
    this.name = "ChordIntegrityError";
  }
}

export class ChordNotAvailableError extends Error {
  public constructor(songId: string) {
    super(`chord is not available for ${songId}`);
    this.name = "ChordNotAvailableError";
  }
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    bytes as BufferSource,
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export class ChordRepository {
  private readonly lifetime = new AbortController();
  private currentManifest: ChordManifestV1 | undefined;
  private currentEtag: string | undefined;
  private refs = new Map<string, ChordRef>();
  private fetchedAt = Number.NEGATIVE_INFINITY;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<ChordManifestV1> | undefined;
  /** A song may be opened by several surfaces at once; share one verified fetch. */
  private readonly inFlightSongs = new Map<string, Promise<ChordDocumentV2>>();
  /** Avoid repeated offline legacy upgrades; explicit retries bypass this gate. */
  private readonly failedRefreshes = new Map<
    string,
    { ref: ChordRef; at: number }
  >();
  /** Missing songs are remembered per immutable source commit for rollback safety. */
  private readonly negative = new Map<string, number>();

  public constructor(
    private readonly upstream: ChordUpstream,
    private readonly cache: ChordCache = new MemoryChordCache(),
    private readonly now: () => number = Date.now,
  ) {}

  public async refreshManifest(
    signal?: AbortSignal,
    force = false,
  ): Promise<ChordManifestV1> {
    signal = this.requestSignal(signal);
    signal.throwIfAborted();
    const age = this.now() - this.fetchedAt;
    if (!force && this.currentManifest && age < MANIFEST_TTL_MS)
      return this.currentManifest;
    if (
      !force &&
      this.currentManifest &&
      this.now() - this.lastAttemptAt < MANIFEST_COOLDOWN_MS
    )
      return this.currentManifest;
    if (this.inFlight) return this.inFlight;
    this.lastAttemptAt = this.now();
    this.inFlight = this.upstream
      .getManifest(this.currentEtag, signal)
      .then((result) => {
        signal.throwIfAborted();
        if (result.notModified && this.currentManifest) {
          this.fetchedAt = this.now();
          return this.currentManifest;
        }
        if (!result.manifest) throw new Error("manifest response has no body");
        const next = ChordManifestV1Schema.parse(result.manifest);
        this.currentManifest = next;
        this.refs = new Map(next.entries.map((entry) => [entry.songId, entry]));
        this.currentEtag = result.etag;
        this.fetchedAt = this.now();
        return next;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  /** One manifest check, then bounded background downloads for missing/changed files. */
  public async syncAll(
    signal?: AbortSignal,
  ): Promise<{ checked: number; failed: number }> {
    signal = this.requestSignal(signal);
    const manifest = await this.refreshManifest(signal, true);
    let index = 0;
    let failed = 0;
    const workers = await Promise.allSettled(
      Array.from({ length: Math.min(3, manifest.entries.length) }, async () => {
        while (index < manifest.entries.length) {
          if (signal?.aborted) throw signal.reason;
          const entry = manifest.entries[index++]!;
          try {
            if (await this.cache.isCurrent?.(entry)) continue;
            if (!this.canAutomaticallyRefresh(entry.songId)) {
              failed += 1;
              continue;
            }
            await this.revalidateSong(entry.songId, signal);
          } catch (error) {
            if (signal?.aborted) throw error;
            failed += 1;
          }
        }
      }),
    );
    const interrupted = workers.find((worker) => worker.status === "rejected");
    if (interrupted?.status === "rejected") throw interrupted.reason;
    return { checked: manifest.entries.length, failed };
  }

  public async getChord(
    songId: string,
    signal?: AbortSignal,
  ): Promise<ChordDocumentV2> {
    signal = this.requestSignal(signal);
    signal.throwIfAborted();
    const cached = await this.cache.get(songId);
    signal.throwIfAborted();
    if (cached) {
      if (this.canAutomaticallyRefresh(songId))
        void this.revalidateSong(songId, signal).catch(() => undefined);
      return cached;
    }
    return this.revalidateSong(songId, signal);
  }

  public async revalidateSong(
    songId: string,
    signal?: AbortSignal,
  ): Promise<ChordDocumentV2> {
    signal = this.requestSignal(signal);
    signal.throwIfAborted();
    const existing = this.inFlightSongs.get(songId);
    if (existing) return existing;
    const request = this.revalidateSongFresh(songId, signal);
    this.inFlightSongs.set(songId, request);
    try {
      const document = await request;
      this.failedRefreshes.delete(songId);
      return document;
    } catch (error) {
      const ref = this.refs.get(songId);
      if (ref && !signal.aborted)
        this.failedRefreshes.set(songId, { ref, at: this.now() });
      throw error;
    } finally {
      if (this.inFlightSongs.get(songId) === request)
        this.inFlightSongs.delete(songId);
    }
  }

  private canAutomaticallyRefresh(songId: string): boolean {
    const failed = this.failedRefreshes.get(songId);
    const ref = this.refs.get(songId);
    return (
      !failed ||
      !ref ||
      ref.sourceCommit !== failed.ref.sourceCommit ||
      ref.sha256 !== failed.ref.sha256 ||
      ref.size !== failed.ref.size ||
      this.now() - failed.at >= MANIFEST_COOLDOWN_MS
    );
  }

  private async revalidateSongFresh(
    songId: string,
    signal?: AbortSignal,
  ): Promise<ChordDocumentV2> {
    const manifest = await this.refreshManifest(signal);
    const negativeKey = `${manifest.sourceCommit}:${songId}`;
    const now = this.now();
    for (const [key, recordedAt] of this.negative) {
      if (now - recordedAt >= NEGATIVE_RETENTION_MS) this.negative.delete(key);
    }
    const recordedAt = this.negative.get(negativeKey);
    if (recordedAt !== undefined && now - recordedAt < NEGATIVE_RETENTION_MS)
      throw new ChordNotAvailableError(songId);
    this.negative.delete(negativeKey);
    const ref = this.refs.get(songId);
    if (!ref) {
      this.negative.set(negativeKey, now);
      throw new ChordNotAvailableError(songId);
    }
    const cached = await this.cache.get(songId);
    const cachedRef = this.cache.getRef?.(songId);
    if (
      cached &&
      cachedRef?.sha256 === ref.sha256 &&
      (cachedRef.sourceCommit === ref.sourceCommit ||
        !("sourceCommit" in cached)) &&
      this.cache.isIntegrityVerified?.(songId) !== false
    )
      return cached;
    const fetched = await this.upstream.fetchChord(ref, signal);
    signal?.throwIfAborted();
    const document = ChordDocumentV2Schema.parse(fetched.document);
    if (fetched.bytes.byteLength !== ref.size)
      throw new ChordIntegrityError(
        `expected ${ref.size} bytes, received ${fetched.bytes.byteLength}`,
      );
    if (
      (await sha256(fetched.bytes)).toLowerCase() !== ref.sha256.toLowerCase()
    )
      throw new ChordIntegrityError(`sha256 mismatch for ${ref.path}`);
    if (
      "songId" in document &&
      (document.songId !== songId || document.sourceCommit !== ref.sourceCommit)
    )
      throw new ChordIntegrityError("document provenance mismatch");
    signal?.throwIfAborted();
    await this.cache.putAtomic(ref, document, fetched.bytes);
    this.negative.delete(negativeKey);
    return document;
  }

  /** Drain in-flight work before the durable storage reset boundary. */
  public async dispose(): Promise<void> {
    this.lifetime.abort();
    await Promise.allSettled([
      ...(this.inFlight ? [this.inFlight] : []),
      ...this.inFlightSongs.values(),
    ]);
    await this.cache.dispose?.();
  }

  private requestSignal(signal?: AbortSignal): AbortSignal {
    return signal
      ? AbortSignal.any([signal, this.lifetime.signal])
      : this.lifetime.signal;
  }
}

export { MemoryChordCache } from "./index.js";
