import type {
  DistributedAssetCatalog,
  DistributedAssetCatalogItem,
  DistributedAssetKind,
} from "@gys/contracts";
import {
  DISTRIBUTED_ASSET_DEFINITIONS,
  loadBundledDistributedAssetCatalog,
  loadDistributedAssetCatalog,
} from "./distributed-assets.js";
import {
  decodeDistributedPackage,
  verifyDistributedPackage,
} from "./distributed-package.js";
import {
  DistributedAssetStore,
  type InstalledDistributedAssetRecord,
} from "./distributed-asset-store.js";
import { normalizeDistributedHymnIndex } from "./distributed-hymnals.js";

export type DistributedAssetState =
  "bundled" | "available" | "installed" | "update" | "unavailable";

export type ManagedDistributedAsset = {
  code: string;
  kind: DistributedAssetKind;
  title: string;
  bundledByDefault: boolean;
  item?: DistributedAssetCatalogItem;
  record?: InstalledDistributedAssetRecord;
  state: DistributedAssetState;
  installedVersion?: string;
  sizeBytes?: number;
};

export type DistributedAssetInstallOptions = {
  signal?: AbortSignal;
  onProgress?: (received: number, total: number) => void;
};

export type DistributedAssetManagerOptions = {
  catalogLoader?: () => Promise<DistributedAssetCatalog>;
  initialCatalogLoader?: () => Promise<DistributedAssetCatalog>;
  store?: DistributedAssetStore;
  fetcher?: typeof fetch;
  downloadBaseUrl?: string;
};

export function distributedDownloadsConfigured(
  baseUrl: string | undefined = import.meta.env.VITE_BFF_BASE_URL,
): boolean {
  return Boolean(baseUrl?.trim());
}

async function readResponseBytes(
  response: Response,
  total: number,
  onProgress?: (received: number, total: number) => void,
): Promise<Uint8Array> {
  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer());
    onProgress?.(bytes.byteLength, total);
    return bytes;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      if (!next.value) continue;
      if (received + next.value.byteLength > total) {
        await reader.cancel();
        throw new Error("Distributed package exceeds its declared size");
      }
      chunks.push(next.value);
      received += next.value.byteLength;
      onProgress?.(received, total);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export class DistributedAssetManager {
  private readonly catalogLoader: () => Promise<DistributedAssetCatalog>;
  private readonly initialCatalogLoader: () => Promise<DistributedAssetCatalog>;
  private readonly store: DistributedAssetStore;
  private readonly fetcher: typeof fetch;
  private readonly downloadBaseUrl?: string;
  private readonly directDownloads: boolean;
  private catalog?: DistributedAssetCatalog;
  private readonly inFlight = new Map<string, Promise<void>>();

  private notifyChanged(): void {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("gys-distributed-assets-change"));
    }
  }

  public constructor(options: DistributedAssetManagerOptions = {}) {
    this.catalogLoader =
      options.catalogLoader ?? (() => loadDistributedAssetCatalog());
    this.initialCatalogLoader =
      options.initialCatalogLoader ??
      options.catalogLoader ??
      (() => loadBundledDistributedAssetCatalog());
    this.store = options.store ?? new DistributedAssetStore();
    this.directDownloads = Boolean(options.fetcher);
    this.fetcher = options.fetcher ?? ((...args) => globalThis.fetch(...args));
    const configuredBase =
      options.downloadBaseUrl ?? import.meta.env.VITE_BFF_BASE_URL;
    this.downloadBaseUrl =
      configuredBase?.trim().replace(/\/$/, "") || undefined;
  }

  public async refresh(): Promise<ManagedDistributedAsset[]> {
    this.catalog = await this.catalogLoader();
    return this.loadStatuses();
  }

  public async loadStatuses(): Promise<ManagedDistributedAsset[]> {
    const catalog =
      this.catalog ?? (this.catalog = await this.initialCatalogLoader());
    const items = new Map(catalog.items.map((item) => [item.code, item]));
    const records = new Map<string, InstalledDistributedAssetRecord>();
    for (const record of await this.store.listRecords()) {
      if (await this.store.hasCachedPayload(record.code)) {
        records.set(record.code, record);
      } else {
        await this.store.remove(record.code);
      }
    }
    return DISTRIBUTED_ASSET_DEFINITIONS.map((definition) => {
      const item = items.get(definition.code);
      const record = records.get(definition.code);
      let state: DistributedAssetState;
      if (definition.bundledByDefault && !record) state = "bundled";
      else if (!item) state = "unavailable";
      else if (!record) state = "available";
      else if (record.version !== item.version) state = "update";
      else state = "installed";
      return {
        ...definition,
        ...(item ? { item, sizeBytes: item.sizeBytes } : {}),
        ...(record ? { record, installedVersion: record.version } : {}),
        state,
      };
    });
  }

  public async install(
    code: string,
    options: DistributedAssetInstallOptions = {},
  ): Promise<void> {
    const existing = this.inFlight.get(code);
    if (existing) return existing;
    const task = this.installInternal(code, options);
    this.inFlight.set(code, task);
    try {
      await task;
    } finally {
      if (this.inFlight.get(code) === task) this.inFlight.delete(code);
    }
  }

  private async installInternal(
    code: string,
    options: DistributedAssetInstallOptions,
  ): Promise<void> {
    const catalog = this.catalog ?? (this.catalog = await this.catalogLoader());
    const item = catalog.items.find((candidate) => candidate.code === code);
    if (!item) throw new Error(`Distributed asset is unavailable: ${code}`);
    if (item.bundledByDefault) {
      throw new Error(`Distributed asset is bundled: ${code}`);
    }
    options.onProgress?.(0, item.sizeBytes);
    const downloadUrl = this.directDownloads
      ? item.downloadUrl
      : this.downloadBaseUrl
        ? `${this.downloadBaseUrl}/api/v1/assets/distributed/${encodeURIComponent(item.code)}`
        : undefined;
    if (!downloadUrl)
      throw new Error("Distributed download service is not configured");
    const response = await this.fetcher(
      downloadUrl,
      options.signal
        ? { cache: "no-store", signal: options.signal }
        : { cache: "no-store" },
    );
    if (!response.ok) {
      throw new Error(`Distributed asset request failed: ${response.status}`);
    }
    const packageBytes = await readResponseBytes(
      response,
      item.sizeBytes,
      options.onProgress,
    );
    await verifyDistributedPackage(item, packageBytes);
    let metadataBytes: Uint8Array | undefined;
    if (item.metadata) {
      const metadataUrl = this.directDownloads
        ? item.metadata.downloadUrl
        : `${this.downloadBaseUrl}/api/v1/assets/distributed/${encodeURIComponent(item.code)}/index`;
      const metadataResponse = await this.fetcher(metadataUrl, {
        cache: "no-store",
        ...(options.signal ? { signal: options.signal } : {}),
      });
      if (!metadataResponse.ok)
        throw new Error(
          `Distributed metadata request failed: ${metadataResponse.status}`,
        );
      metadataBytes = new Uint8Array(await metadataResponse.arrayBuffer());
      await verifyDistributedPackage(
        {
          code: `${item.code}:metadata`,
          sizeBytes: item.metadata.sizeBytes,
          checksumSha256: item.metadata.checksumSha256,
        },
        metadataBytes,
      );
      normalizeDistributedHymnIndex(
        item.code,
        JSON.parse(new TextDecoder().decode(metadataBytes)),
      );
    }
    const payload = await decodeDistributedPackage(packageBytes);
    await this.store.put(
      {
        code: item.code,
        kind: item.kind,
        version: item.version,
        releaseTag: item.releaseTag,
        installFileName: item.installFileName,
        packageSizeBytes: item.sizeBytes,
        packageChecksumSha256: item.checksumSha256,
      },
      payload,
      metadataBytes && item.metadata
        ? {
            bytes: metadataBytes,
            checksumSha256: item.metadata.checksumSha256,
          }
        : undefined,
    );
    this.notifyChanged();
    options.onProgress?.(item.sizeBytes, item.sizeBytes);
  }

  public async remove(code: string): Promise<void> {
    const definition = DISTRIBUTED_ASSET_DEFINITIONS.find(
      (candidate) => candidate.code === code,
    );
    if (definition?.bundledByDefault) {
      throw new Error(`Bundled asset cannot be removed: ${code}`);
    }
    await this.store.remove(code);
    this.notifyChanged();
  }

  public getStore(): DistributedAssetStore {
    return this.store;
  }
}

let defaultManager: DistributedAssetManager | undefined;

export function getDistributedAssetManager(): DistributedAssetManager {
  return (defaultManager ??= new DistributedAssetManager());
}
