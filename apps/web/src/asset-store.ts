import type { AssetManifestItem } from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";

type StoredAsset = {
  id: string;
  version: string;
  cacheName: string;
  url: string;
  bytes: number;
  sha256?: string;
  storedAt: string;
};

const INDEX_KEY = "gys-asset-index-v1";
const CACHE_PREFIX = "gys-assets-v1-";

function hasCacheStorage(): boolean {
  return typeof window !== "undefined" && "caches" in window;
}

function waitForSignal<T>(
  promise: Promise<T>,
  signal?: AbortSignal,
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted)
    return Promise.reject(signal.reason ?? new Error("Asset download aborted"));
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      signal.removeEventListener("abort", abort);
      reject(signal.reason ?? new Error("Asset download aborted"));
    };
    signal.addEventListener("abort", abort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener("abort", abort);
        reject(error);
      },
    );
  });
}

function readIndex(): Record<string, StoredAsset> {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(INDEX_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([key, entry]) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry))
          return [];
        const item = entry as Partial<StoredAsset>;
        if (
          typeof item.id !== "string" ||
          typeof item.version !== "string" ||
          typeof item.cacheName !== "string" ||
          typeof item.url !== "string" ||
          typeof item.bytes !== "number"
        )
          return [];
        return [[key, item as StoredAsset]];
      }),
    );
  } catch {
    return {};
  }
}

function writeIndex(value: Record<string, StoredAsset>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(value));
  } catch {
    // Storage quota must not turn a successfully verified download into a
    // broken app. The Cache Storage entry remains recoverable this session.
  }
}

function assetUrl(item: AssetManifestItem): string {
  if (item.url) return item.url;
  if (typeof window === "undefined") return item.path;
  return new URL(
    item.path.replace(/^\//, ""),
    window.location.origin + import.meta.env.BASE_URL,
  ).toString();
}

export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyAssetBytes(
  item: Pick<AssetManifestItem, "id" | "bytes" | "sha256">,
  bytes: Uint8Array,
): Promise<void> {
  if (item.bytes !== undefined && bytes.byteLength !== item.bytes)
    throw new Error(`Asset size mismatch for ${item.id}`);
  if (item.sha256 && (await sha256(bytes)).toLowerCase() !== item.sha256)
    throw new Error(`Asset checksum mismatch for ${item.id}`);
}

function cacheName(item: AssetManifestItem): string {
  const safe = `${item.id}-${item.version}`
    .replace(/[^a-z0-9_-]+/gi, "-")
    .slice(0, 90);
  return `${CACHE_PREFIX}${safe}`;
}

export class BrowserAssetStore {
  private readonly inFlightDownloads = new Map<string, Promise<Uint8Array>>();

  public async get(item: AssetManifestItem): Promise<Uint8Array | undefined> {
    if (!hasCacheStorage()) return undefined;
    const url = assetUrl(item);
    const index = readIndex();
    const stored = index[item.id];
    const candidates =
      stored?.version === item.version ? [stored.cacheName] : [cacheName(item)];
    for (const name of candidates) {
      const response = await caches
        .open(name)
        .then((cache) => cache.match(url));
      if (!response) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      try {
        await verifyAssetBytes(item, bytes);
        if (!stored || stored.version !== item.version) {
          index[item.id] = {
            id: item.id,
            version: item.version,
            cacheName: name,
            url,
            bytes: bytes.byteLength,
            ...(item.sha256 ? { sha256: item.sha256 } : {}),
            storedAt: new Date().toISOString(),
          };
          writeIndex(index);
        }
        return bytes;
      } catch {
        await caches.open(name).then((cache) => cache.delete(url));
        delete index[item.id];
        writeIndex(index);
      }
    }
    return undefined;
  }

  public async put(
    item: AssetManifestItem,
    bytes: Uint8Array,
    contentType = "application/octet-stream",
  ): Promise<void> {
    await verifyAssetBytes(item, bytes);
    if (!hasCacheStorage()) throw new Error("Cache Storage unavailable");
    const url = assetUrl(item);
    const name = cacheName(item);
    const cache = await caches.open(name);
    await cache.put(
      url,
      new Response(bytes.slice().buffer as ArrayBuffer, {
        headers: { "content-type": contentType },
      }),
    );
    const stored: StoredAsset = {
      id: item.id,
      version: item.version,
      cacheName: name,
      url,
      bytes: bytes.byteLength,
      ...(item.sha256 ? { sha256: item.sha256 } : {}),
      storedAt: new Date().toISOString(),
    };
    const index = readIndex();
    const previous = index[item.id];
    index[item.id] = stored;
    writeIndex(index);
    if (previous && previous.cacheName !== name)
      await caches.delete(previous.cacheName);
  }

  public async download(
    item: AssetManifestItem,
    signal?: AbortSignal,
  ): Promise<Uint8Array> {
    const key = `${item.id}:${item.version}:${item.url ?? item.path}`;
    const existing = this.inFlightDownloads.get(key);
    if (existing) return waitForSignal(existing, signal);
    const request = (async () => {
      const cached = await this.get(item);
      if (cached) return cached;
      const response = await fetch(assetUrl(item), { cache: "no-store" });
      if (!response.ok)
        throw new Error(`Asset request failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      await this.put(
        item,
        bytes,
        response.headers.get("content-type") ?? undefined,
      );
      return bytes;
    })();
    this.inFlightDownloads.set(key, request);
    try {
      return await waitForSignal(request, signal);
    } finally {
      if (this.inFlightDownloads.get(key) === request)
        this.inFlightDownloads.delete(key);
    }
  }

  /**
   * Fetch and verify a complete pack before moving its entries into the active
   * index. Existing active entries remain usable if any staged fetch fails.
   */
  public async installPack(
    items: AssetManifestItem[],
    signal?: AbortSignal,
    onProgress?: (completed: number, total: number) => void,
  ): Promise<void> {
    if (!hasCacheStorage()) throw new Error("Cache Storage unavailable");
    const staged: Array<{
      item: AssetManifestItem;
      bytes: Uint8Array;
      contentType: string | undefined;
    }> = [];
    try {
      for (const item of items) {
        if (item.source !== "local" && !item.url) continue;
        const response = await fetch(assetUrl(item), {
          cache: "reload",
          ...(signal ? { signal } : {}),
        });
        if (!response.ok)
          throw new Error(
            `Asset request failed: ${item.id} (${response.status})`,
          );
        const bytes = new Uint8Array(await response.arrayBuffer());
        await verifyAssetBytes(item, bytes);
        staged.push({
          item,
          bytes,
          contentType: response.headers.get("content-type") ?? undefined,
        });
        onProgress?.(staged.length, items.length);
      }
      const index = readIndex();
      const previous = new Map<string, StoredAsset>();
      for (const entry of staged) {
        const url = assetUrl(entry.item);
        const name = cacheName(entry.item);
        await caches.open(name).then((cache) =>
          cache.put(
            url,
            new Response(entry.bytes.slice().buffer as ArrayBuffer, {
              headers: {
                "content-type": entry.contentType ?? "application/octet-stream",
              },
            }),
          ),
        );
        const previousEntry = index[entry.item.id];
        if (previousEntry) previous.set(entry.item.id, previousEntry);
        index[entry.item.id] = {
          id: entry.item.id,
          version: entry.item.version,
          cacheName: name,
          url,
          bytes: entry.bytes.byteLength,
          ...(entry.item.sha256 ? { sha256: entry.item.sha256 } : {}),
          storedAt: new Date().toISOString(),
        };
      }
      // The index pointer is swapped only after every staged response has
      // passed checksum/size validation and has been written successfully.
      writeIndex(index);
      await Promise.all(
        [...previous.values()]
          .filter((entry) => entry.cacheName !== index[entry.id]?.cacheName)
          .map((entry) => caches.delete(entry.cacheName)),
      );
    } catch (error) {
      // No active index entries are changed until all resources validate.
      recordDiagnostic("error", "assets.install", error);
      throw error;
    }
  }

  public async remove(item: Pick<AssetManifestItem, "id">): Promise<void> {
    const index = readIndex();
    const previous = index[item.id];
    if (previous && hasCacheStorage()) await caches.delete(previous.cacheName);
    delete index[item.id];
    writeIndex(index);
  }

  public async clear(): Promise<void> {
    const index = readIndex();
    if (hasCacheStorage())
      await Promise.all(
        Object.values(index).map((entry) => caches.delete(entry.cacheName)),
      );
    if (typeof window !== "undefined") localStorage.removeItem(INDEX_KEY);
  }

  public stats(): { entries: number; bytes: number } {
    const entries = Object.values(readIndex());
    return {
      entries: entries.length,
      bytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    };
  }
}

export const assetStore = new BrowserAssetStore();
