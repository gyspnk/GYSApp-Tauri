import type { DistributedAssetKind } from "@gys/contracts";
import { sha256 } from "./asset-store.js";

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
  payloadChecksumSha256?: string;
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
  const payloadChecksumValid =
    record.payloadChecksumSha256 === undefined ||
    (typeof record.payloadChecksumSha256 === "string" &&
      /^[a-f\d]{64}$/i.test(record.payloadChecksumSha256));
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
    metadataValid &&
    payloadChecksumValid
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
    if (record.payloadChecksumSha256) {
      if (
        (await sha256(bytes)).toLowerCase() !==
        record.payloadChecksumSha256.toLowerCase()
      )
        return undefined;
    } else {
      // Earlier releases verified the package before persisting its payload.
      const payloadChecksumSha256 = await sha256(bytes);
      const registry = this.readRegistry();
      const current = registry[code];
      if (
        current?.cacheName === record.cacheName &&
        !current.payloadChecksumSha256
      ) {
        registry[code] = { ...current, payloadChecksumSha256 };
        try {
          this.writeRegistry(registry);
        } catch {
          // Keep an existing offline asset usable if the index cannot be updated.
        }
      }
    }
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
    if (bytes.byteLength !== record.metadataBytes) return undefined;
    if (
      (await sha256(bytes)).toLowerCase() !==
      record.metadataChecksumSha256?.toLowerCase()
    )
      return undefined;
    return bytes;
  }

  public async hasCachedPayload(code: string): Promise<boolean> {
    if (!(await this.getBytes(code))) return false;
    const record = await this.getRecord(code);
    if (!record) return false;
    if (!record.metadataCacheKey || record.metadataBytes === undefined)
      return true;
    return Boolean(await this.getMetadataBytes(code));
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
      payloadChecksumSha256: await sha256(bytes),
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
