import {
  AssetManifestV1Schema,
  UpstreamMusicLockSchema,
  type UpstreamMusicItem,
  type UpstreamMusicLock,
} from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";

const RAW_ROOT = "https://raw.githubusercontent.com/gyspnk/gyschordweb";
const CACHE_NAME = "gys-music-assets-v1";
let lockPromise: Promise<UpstreamMusicLock> | undefined;
let bundledMusicPathsPromise: Promise<Set<string>> | undefined;
const inFlight = new Map<string, Promise<Uint8Array>>();
const MAX_MEMORY_HINTS = 96;
const recentlyUsed = new Map<string, number>();

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function assetUrl(
  ref: Pick<UpstreamMusicItem, "path" | "sha256">,
  lock: UpstreamMusicLock,
): string {
  const path = ref.path
    .replace(/^docs\//, "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `${RAW_ROOT}/${encodeURIComponent(lock.sourceCommit)}/docs/${path}`;
}

export async function resolveMusicAssetUrl(
  ref: Pick<UpstreamMusicItem, "path" | "sha256">,
  lock?: UpstreamMusicLock,
): Promise<string> {
  if ((await bundledMusicPaths()).has(ref.path)) return localUrl(ref);
  const resolvedLock = lock ?? (await loadMusicLock());
  return bffAssetUrl(ref, resolvedLock) ?? assetUrl(ref, resolvedLock);
}

function bffAssetUrl(
  ref: Pick<UpstreamMusicItem, "path">,
  lock: UpstreamMusicLock,
): string | undefined {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (!base) return undefined;
  return `${base.replace(/\/$/, "")}/api/v1/content/music?commit=${encodeURIComponent(lock.sourceCommit)}&path=${encodeURIComponent(ref.path)}`;
}

export async function loadMusicLock(): Promise<UpstreamMusicLock> {
  lockPromise ??= fetch(`${import.meta.env.BASE_URL}offline/music-lock.json`, {
    cache: "force-cache",
  }).then(async (response) => {
    if (!response.ok) throw new Error("Music lock unavailable");
    return UpstreamMusicLockSchema.parse(await response.json());
  });
  return lockPromise;
}

function normalizedAssetName(path: string): string {
  return (
    path
      .replace(/^docs\//, "")
      .split("/")
      .pop()
      ?.trim()
      .toLocaleLowerCase()
      .replace(/_\s+/g, "_")
      .replace(/\s+/g, " ") ?? ""
  );
}

/**
 * Resolve generated hymn-catalog paths against the immutable gyschordweb lock.
 * The two upstream generators differ only in filename whitespace for a number
 * of PDFs/MIDI files (for example `051A_ Batu` vs `051A_Batu`). Falling back
 * to the stable hymn number/suffix keeps binary loading deterministic without
 * duplicating or editing either upstream snapshot.
 */
export function findMusicAsset(
  lock: UpstreamMusicLock,
  kind: UpstreamMusicItem["kind"],
  path: string,
): UpstreamMusicItem | undefined {
  const candidates = lock.items.filter((item) => item.kind === kind);
  const exact = candidates.find((item) => item.path === path);
  if (exact) return exact;
  const normalized = normalizedAssetName(path);
  const byName = candidates.find(
    (item) => normalizedAssetName(item.path) === normalized,
  );
  if (byName) return byName;
  const key = normalized.match(/^(\d{3}[a-z]?)(?:_|\s)/i)?.[1];
  if (!key) return undefined;
  return candidates.find((item) => {
    const candidate = normalizedAssetName(item.path);
    return candidate.startsWith(`${key.toLocaleLowerCase()}_`);
  });
}

function localUrl(ref: Pick<UpstreamMusicItem, "path">): string {
  return new URL(
    ref.path.replace(/^\//, "").replace(/^docs\//, ""),
    window.location.origin + import.meta.env.BASE_URL,
  ).toString();
}

async function bundledMusicPaths(): Promise<Set<string>> {
  bundledMusicPathsPromise ??= fetch(
    `${import.meta.env.BASE_URL}offline/asset-manifest.json`,
    { cache: "force-cache" },
  )
    .then(async (response) => {
      if (!response.ok) throw new Error("Bundled asset manifest unavailable");
      const manifest = AssetManifestV1Schema.parse(await response.json());
      return new Set(
        manifest.items
          .filter(
            (item) =>
              item.source === "local" &&
              (item.kind === "pdf" ||
                item.kind === "midi" ||
                item.kind === "chord"),
          )
          .map((item) => item.path),
      );
    })
    .catch(() => new Set<string>());
  return bundledMusicPathsPromise;
}

async function readAndVerify(
  response: Response,
  ref: UpstreamMusicItem,
): Promise<Uint8Array> {
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (ref.size && bytes.byteLength !== ref.size)
    throw new Error(`Asset size mismatch for ${ref.id}`);
  if ((await sha256(bytes)).toLowerCase() !== ref.sha256.toLowerCase())
    throw new Error(`Asset integrity mismatch for ${ref.id}`);
  return bytes;
}

async function cachedResponse(
  url: string,
  ref: UpstreamMusicItem,
): Promise<Uint8Array | undefined> {
  if (!("caches" in window)) return undefined;
  const cache = await caches.open(CACHE_NAME);
  const response = await cache.match(url);
  if (!response) return undefined;
  try {
    return await readAndVerify(response, ref);
  } catch {
    await cache.delete(url);
    return undefined;
  }
}

async function networkResponse(
  url: string,
  ref: UpstreamMusicItem,
): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok) throw new Error(`Asset request failed: ${response.status}`);
  const bytes = await readAndVerify(response, ref);
  if ("caches" in window) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(
      url,
      new Response(bytes.slice().buffer as ArrayBuffer, {
        headers: {
          "content-type":
            response.headers.get("content-type") ?? "application/octet-stream",
        },
      }),
    );
  }
  return bytes;
}

export async function loadMusicAsset(
  ref: UpstreamMusicItem,
): Promise<Uint8Array> {
  recentlyUsed.delete(ref.sha256);
  recentlyUsed.set(ref.sha256, Date.now());
  while (recentlyUsed.size > MAX_MEMORY_HINTS)
    recentlyUsed.delete(recentlyUsed.keys().next().value as string);
  const existing = inFlight.get(ref.sha256);
  if (existing) return existing;
  const request = (async () => {
    // Only probe files explicitly listed as bundled.  Remote-only assets must
    // go straight to the immutable source/BFF instead of creating a known 404
    // request on GitHub Pages for every hymn open.
    if ((await bundledMusicPaths()).has(ref.path)) {
      const local = localUrl(ref);
      try {
        const response = await fetch(local, { cache: "force-cache" });
        if (response.ok) return await readAndVerify(response, ref);
      } catch {
        // A corrupt/missing seed falls through to the verified remote copy.
      }
    }
    const lock = await loadMusicLock();
    const candidates = [bffAssetUrl(ref, lock), assetUrl(ref, lock)].filter(
      (value): value is string => Boolean(value),
    );
    let lastError: unknown;
    for (const remote of candidates) {
      try {
        const cached = await cachedResponse(remote, ref);
        if (cached) return cached;
        return await networkResponse(remote, ref);
      } catch (error) {
        lastError = error;
      }
    }
    const failure =
      lastError instanceof Error
        ? lastError
        : new Error(`Asset request failed for ${ref.id}`);
    recordDiagnostic("error", "music.asset", failure);
    throw failure;
  })();
  inFlight.set(ref.sha256, request);
  try {
    return await request;
  } finally {
    inFlight.delete(ref.sha256);
  }
}

/** Warm only binary music assets; PDF pages stay on-demand to protect mobile data. */
export async function prefetchMusicAsset(
  ref: UpstreamMusicItem | undefined,
): Promise<boolean> {
  if (!ref || ref.kind === "pdf") return false;
  if (typeof navigator === "undefined" || !navigator.onLine) return false;
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData || connection?.effectiveType === "2g") return false;
  try {
    await loadMusicAsset(ref);
    return true;
  } catch {
    return false;
  }
}

export async function musicAssetStats(): Promise<{
  entries: number;
  bytes: number;
}> {
  if (typeof window === "undefined" || !("caches" in window))
    return { entries: 0, bytes: 0 };
  const cache = await caches.open(CACHE_NAME);
  const requests = await cache.keys();
  let bytes = 0;
  for (const request of requests) {
    const response = await cache.match(request);
    bytes += Number(response?.headers.get("content-length") ?? 0);
  }
  return { entries: requests.length, bytes };
}

export async function clearMusicAssetCache(): Promise<void> {
  inFlight.clear();
  recentlyUsed.clear();
  if (typeof window !== "undefined" && "caches" in window)
    await caches.delete(CACHE_NAME);
}

export function downloadMusicAsset(
  ref: Pick<UpstreamMusicItem, "path" | "id">,
  bytes: Uint8Array,
): void {
  const extension = ref.path.split(".").pop() ?? "bin";
  const url = URL.createObjectURL(
    new Blob([bytes.slice().buffer as ArrayBuffer], {
      type:
        extension === "pdf" ? "application/pdf" : "application/octet-stream",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  const safeId =
    ref.id
      .split("/")
      .pop()
      ?.replace(/\.[^.]+$/, "") ?? "gys-asset";
  anchor.download = `${safeId}.${extension}`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
