import type { DistributedAssetKind } from "@gys/contracts";

const REGISTRY_KEY = "gys-distributed-assets-v1";
const CACHE_PREFIX = "gys-distributed-v1-";
let cacheSequence = 0;

export type DistributedAssetRecordInput = {
  code: string;
  kind: DistributedAssetKind;
  version: string;
  releaseTag: string;
  installFileName: string;
  packageSizeBytes: number;
  packageChecksumSha256: string;
};

export type InstalledDistributedAssetRecord = DistributedAssetRecordInput & {
  cacheName: string;
  cacheKey: string;
  payloadBytes: number;
  installedAt: string;
  metadataCacheKey?: string;
  metadataBytes?: number;
  metadataChecksumSha256?: string;
};

type DistributedAssetCache = {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
};

export type DistributedAssetCacheStorage = {
  open(name: string): Promise<DistributedAssetCache>;
  delete(name: string): Promise<boolean>;
};

export type DistributedAssetStoreOptions = {
  cacheStorage?: DistributedAssetCacheStorage;
  registry?: Storage;
  now?: () => string;
};

function defaultCacheStorage(): DistributedAssetCacheStorage {
  if (typeof caches === "undefined") {
    throw new Error("Cache Storage unavailable");
  }
  return caches as unknown as DistributedAssetCacheStorage;
}

function defaultRegistry(): Storage {
  if (typeof localStorage === "undefined") {
    throw new Error("Local storage unavailable");
  }
  return localStorage;
}

function safePart(value: string): string {
  return encodeURIComponent(value).replace(/%/g, "-").slice(0, 80);
}

function cacheName(
  record: DistributedAssetRecordInput,
  installedAt: string,
): string {
  return `${CACHE_PREFIX}${safePart(record.code)}-${safePart(record.version)}-${safePart(installedAt)}-${cacheSequence++}`;
}

function cacheKey(record: DistributedAssetRecordInput): string {
  return `https://gysapp.local/distributed-assets/${encodeURIComponent(record.code)}/${encodeURIComponent(record.version)}`;
}

function metadataCacheKey(record: DistributedAssetRecordInput): string {
  return `${cacheKey(record)}/catalog`;
}

function isRecord(value: unknown): value is InstalledDistributedAssetRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Partial<InstalledDistributedAssetRecord>;
  const metadataValid =
    record.metadataCacheKey === undefined &&
    record.metadataBytes === undefined &&
    record.metadataChecksumSha256 === undefined
      ? true
      : typeof record.metadataCacheKey === "string" &&
        typeof record.metadataBytes === "number" &&
        typeof record.metadataChecksumSha256 === "string";
  return (
    typeof record.code === "string" &&
    typeof record.kind === "string" &&
    typeof record.version === "string" &&
    typeof record.releaseTag === "string" &&
    typeof record.installFileName === "string" &&
    typeof record.packageSizeBytes === "number" &&
    typeof record.packageChecksumSha256 === "string" &&
    typeof record.cacheName === "string" &&
    typeof record.cacheKey === "string" &&
    typeof record.payloadBytes === "number" &&
    typeof record.installedAt === "string" &&
    metadataValid
  );
}

export class DistributedAssetStore {
  private readonly cacheStorage: DistributedAssetCacheStorage;
  private readonly registry: Storage;
  private readonly now: () => string;

  public constructor(options: DistributedAssetStoreOptions = {}) {
    this.cacheStorage = options.cacheStorage ?? defaultCacheStorage();
    this.registry = options.registry ?? defaultRegistry();
    this.now = options.now ?? (() => new Date().toISOString());
  }

  private readRegistry(): Record<string, InstalledDistributedAssetRecord> {
    try {
      const parsed: unknown = JSON.parse(
        this.registry.getItem(REGISTRY_KEY) ?? "{}",
      );
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        return {};
      return Object.fromEntries(
        Object.entries(parsed).flatMap(([code, value]) =>
          isRecord(value) && value.code === code ? [[code, value]] : [],
        ),
      );
    } catch {
      return {};
    }
  }

  private writeRegistry(
    value: Record<string, InstalledDistributedAssetRecord>,
  ): void {
    this.registry.setItem(REGISTRY_KEY, JSON.stringify(value));
  }

  public async getRecord(
    code: string,
  ): Promise<InstalledDistributedAssetRecord | undefined> {
    return this.readRegistry()[code];
  }

  public async listRecords(): Promise<InstalledDistributedAssetRecord[]> {
    return Object.values(this.readRegistry());
  }

  public async getBytes(code: string): Promise<Uint8Array | undefined> {
    const record = await this.getRecord(code);
    if (!record) return undefined;
    const response = await this.cacheStorage
      .open(record.cacheName)
      .then((cache) => cache.match(record.cacheKey));
    if (!response) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== record.payloadBytes) return undefined;
    return bytes;
  }

  public async getMetadataBytes(code: string): Promise<Uint8Array | undefined> {
    const record = await this.getRecord(code);
    if (!record?.metadataCacheKey || record.metadataBytes === undefined)
      return undefined;
    const response = await this.cacheStorage
      .open(record.cacheName)
      .then((cache) => cache.match(record.metadataCacheKey!));
    if (!response) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.byteLength === record.metadataBytes ? bytes : undefined;
  }

  public async hasCachedPayload(code: string): Promise<boolean> {
    const record = await this.getRecord(code);
    if (!record) return false;
    const cache = await this.cacheStorage.open(record.cacheName);
    const payload = await cache.match(record.cacheKey);
    if (!payload || !(await responseHasSize(payload, record.payloadBytes)))
      return false;
    if (!record.metadataCacheKey || record.metadataBytes === undefined)
      return true;
    const metadata = await cache.match(record.metadataCacheKey);
    return Boolean(
      metadata && (await responseHasSize(metadata, record.metadataBytes)),
    );
  }

  public async put(
    input: DistributedAssetRecordInput,
    bytes: Uint8Array,
    metadata?: { bytes: Uint8Array; checksumSha256: string },
  ): Promise<void> {
    const installedAt = this.now();
    const next: InstalledDistributedAssetRecord = {
      ...input,
      cacheName: cacheName(input, installedAt),
      cacheKey: cacheKey(input),
      payloadBytes: bytes.byteLength,
      installedAt,
      ...(metadata
        ? {
            metadataCacheKey: metadataCacheKey(input),
            metadataBytes: metadata.bytes.byteLength,
            metadataChecksumSha256: metadata.checksumSha256,
          }
        : {}),
    };
    const cache = await this.cacheStorage.open(next.cacheName);
    try {
      await cache.put(
        next.cacheKey,
        new Response(bytes.slice().buffer as ArrayBuffer, {
          headers: {
            "content-length": String(bytes.byteLength),
            "content-type": "application/octet-stream",
          },
        }),
      );
      if (metadata && next.metadataCacheKey) {
        await cache.put(
          next.metadataCacheKey,
          new Response(metadata.bytes.slice().buffer as ArrayBuffer, {
            headers: {
              "content-length": String(metadata.bytes.byteLength),
              "content-type": "application/json",
            },
          }),
        );
      }
    } catch (error) {
      await this.cacheStorage.delete(next.cacheName);
      throw error;
    }

    const registry = this.readRegistry();
    const previous = registry[next.code];
    registry[next.code] = next;
    try {
      this.writeRegistry(registry);
    } catch (error) {
      await this.cacheStorage.delete(next.cacheName);
      throw error;
    }

    if (previous && previous.cacheName !== next.cacheName) {
      await this.cacheStorage.delete(previous.cacheName);
    }
  }

  public async remove(code: string): Promise<void> {
    const registry = this.readRegistry();
    const previous = registry[code];
    if (!previous) return;
    delete registry[code];
    this.writeRegistry(registry);
    await this.cacheStorage.delete(previous.cacheName);
  }

  public async clear(): Promise<void> {
    const records = await this.listRecords();
    await Promise.all(
      records.map((record) => this.cacheStorage.delete(record.cacheName)),
    );
    this.registry.removeItem(REGISTRY_KEY);
  }
}

async function responseHasSize(
  response: Response,
  expected: number,
): Promise<boolean> {
  const value = response.headers.get("content-length");
  if (value !== null) {
    const header = Number(value);
    if (Number.isFinite(header) && header >= 0) return header === expected;
  }
  return (await response.clone().blob()).size === expected;
}
