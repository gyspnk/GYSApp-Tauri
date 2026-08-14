import {
  ChordDocumentV2Schema,
  ChordManifestV1Schema,
  type ChordDocumentV2,
  type ChordManifestV1,
  type ChordRef,
} from "@gys/contracts";
import { MemoryChordCache } from "./index.js";

export type ManifestResult = { manifest: ChordManifestV1; etag?: string };
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
}

const MANIFEST_TTL_MS = 6 * 60 * 60 * 1000;
const MANIFEST_COOLDOWN_MS = 60 * 1000;

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
  private currentManifest: ChordManifestV1 | undefined;
  private currentEtag: string | undefined;
  private fetchedAt = Number.NEGATIVE_INFINITY;
  private lastAttemptAt = Number.NEGATIVE_INFINITY;
  private inFlight: Promise<ChordManifestV1> | undefined;

  public constructor(
    private readonly upstream: ChordUpstream,
    private readonly cache: ChordCache = new MemoryChordCache(),
    private readonly now: () => number = Date.now,
  ) {}

  public async refreshManifest(
    signal?: AbortSignal,
    force = false,
  ): Promise<ChordManifestV1> {
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
        const next = ChordManifestV1Schema.parse(result.manifest);
        this.currentManifest = next;
        this.currentEtag = result.etag;
        this.fetchedAt = this.now();
        return next;
      })
      .finally(() => {
        this.inFlight = undefined;
      });
    return this.inFlight;
  }

  public async getChord(
    songId: string,
    signal?: AbortSignal,
  ): Promise<ChordDocumentV2> {
    const cached = await this.cache.get(songId);
    if (cached) {
      void this.revalidateSong(songId, signal).catch(() => undefined);
      return cached;
    }
    return this.revalidateSong(songId, signal);
  }

  public async revalidateSong(
    songId: string,
    signal?: AbortSignal,
  ): Promise<ChordDocumentV2> {
    const manifest = await this.refreshManifest(signal);
    const ref = manifest.entries.find((entry) => entry.songId === songId);
    if (!ref) throw new ChordNotAvailableError(songId);
    const cachedRef = this.cache.getRef?.(songId);
    const cached = await this.cache.get(songId);
    if (
      cached &&
      cachedRef?.sha256 === ref.sha256 &&
      cachedRef.sourceCommit === ref.sourceCommit
    )
      return cached;
    const fetched = await this.upstream.fetchChord(ref, signal);
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
      document.songId !== songId ||
      document.sourceCommit !== ref.sourceCommit
    )
      throw new ChordIntegrityError("document provenance mismatch");
    await this.cache.putAtomic(ref, document, fetched.bytes);
    return document;
  }
}

export { MemoryChordCache } from "./index.js";
