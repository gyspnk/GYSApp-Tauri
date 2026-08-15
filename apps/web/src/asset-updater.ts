import {
  AssetManifestV1Schema,
  type AssetManifestItem,
  type AssetManifestV1,
} from "@gys/contracts";
import { recordDiagnostic } from "./diagnostics.js";
import { assetStore } from "./asset-store.js";

const ACTIVE_MANIFEST_KEY = "gys-active-asset-manifest-v1";
const TRUSTED_ASSET_HOSTS = new Set([
  "raw.githubusercontent.com",
  "tjc.org",
  "www.tjc.org",
]);

export type AssetManifestDiff = {
  added: AssetManifestItem[];
  changed: AssetManifestItem[];
  removed: AssetManifestItem[];
  unchanged: number;
  hasUpdate: boolean;
};

export type AssetManifestCheck = {
  manifest: AssetManifestV1;
  diff: AssetManifestDiff;
  url: string;
};

type ActiveManifestRecord = {
  version: 1;
  sourceUrl: string;
  manifest: AssetManifestV1;
};

function baseUrl(): string {
  if (typeof window !== "undefined") return window.location.href;
  return "http://localhost/";
}

/**
 * A deployment may publish a newer manifest from a Worker or a signed static
 * origin. When no override is configured, the immutable Pages manifest is the
 * safe baseline and checking it is still useful for repair/revalidation.
 */
export function assetManifestUrl(override?: string): string {
  const configured =
    override?.trim() || import.meta.env.VITE_ASSET_MANIFEST_URL?.trim();
  if (configured) return new URL(configured, baseUrl()).toString();
  return new URL(
    `${import.meta.env.BASE_URL.replace(/\/$/, "")}/offline/asset-manifest.json`,
    baseUrl(),
  ).toString();
}

function allowedManifestOrigin(url: URL, manifestUrl: string): boolean {
  try {
    if (url.origin === new URL(manifestUrl, baseUrl()).origin) return true;
  } catch {
    // The caller reports the final URL validation error below.
  }
  if (typeof window !== "undefined" && url.origin === window.location.origin)
    return true;
  const configuredBff = import.meta.env.VITE_BFF_BASE_URL?.trim();
  if (configuredBff) {
    try {
      if (url.origin === new URL(configuredBff, baseUrl()).origin) return true;
    } catch {
      // Invalid build-time configuration is handled by the normal URL check.
    }
  }
  return TRUSTED_ASSET_HOSTS.has(url.hostname.toLowerCase());
}

function validateAssetUrl(value: string, manifestUrl: string): void {
  const url = new URL(value, manifestUrl);
  const localDevelopment =
    url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !localDevelopment)
    throw new Error(`Asset URL must use HTTPS: ${url.hostname}`);
  if (!allowedManifestOrigin(url, manifestUrl))
    throw new Error(`Asset URL origin is not allowlisted: ${url.hostname}`);
}

/**
 * Parse a manifest at the application boundary. A valid Zod shape is not
 * enough on its own: duplicate IDs could make the active pointer ambiguous,
 * and an untrusted URL would turn the asset store into an arbitrary fetcher.
 */
export function parseAssetManifest(
  input: unknown,
  manifestUrl = assetManifestUrl(),
): AssetManifestV1 {
  const parsed = AssetManifestV1Schema.parse(input);
  const ids = new Set<string>();
  for (const item of parsed.items) {
    if (ids.has(item.id)) throw new Error(`Duplicate asset id: ${item.id}`);
    ids.add(item.id);
    const candidate = item.url ?? item.path;
    if (item.source === "remote" || item.url) {
      validateAssetUrl(candidate, manifestUrl);
    }
  }
  return parsed;
}

function signature(item: AssetManifestItem): string {
  return JSON.stringify([
    item.kind,
    item.source,
    item.path,
    item.url ?? "",
    item.version,
    item.sha256 ?? "",
    item.bytes ?? -1,
  ]);
}

export function compareAssetManifests(
  previous: AssetManifestV1,
  next: AssetManifestV1,
): AssetManifestDiff {
  const before = new Map(previous.items.map((item) => [item.id, item]));
  const after = new Map(next.items.map((item) => [item.id, item]));
  const added: AssetManifestItem[] = [];
  const changed: AssetManifestItem[] = [];
  let unchanged = 0;
  for (const item of next.items) {
    const old = before.get(item.id);
    if (!old) added.push(item);
    else if (signature(old) === signature(item)) unchanged += 1;
    else changed.push(item);
  }
  const removed = previous.items.filter((item) => !after.has(item.id));
  return {
    added,
    changed,
    removed,
    unchanged,
    hasUpdate: added.length > 0 || changed.length > 0 || removed.length > 0,
  };
}

export async function fetchAssetManifest(
  signal?: AbortSignal,
  overrideUrl?: string,
): Promise<AssetManifestV1> {
  const url = assetManifestUrl(overrideUrl);
  const response = await fetch(url, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });
  if (!response.ok)
    throw new Error(`Asset manifest request failed: ${response.status}`);
  return parseAssetManifest(await response.json(), url);
}

export async function checkAssetManifest(
  previous: AssetManifestV1,
  signal?: AbortSignal,
  overrideUrl?: string,
): Promise<AssetManifestCheck> {
  const url = assetManifestUrl(overrideUrl);
  const manifest = await fetchAssetManifest(signal, url);
  return { manifest, diff: compareAssetManifests(previous, manifest), url };
}

export function readActiveAssetManifest(): AssetManifestV1 | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = localStorage.getItem(ACTIVE_MANIFEST_KEY);
    if (!raw) return undefined;
    const value: unknown = JSON.parse(raw);
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "manifest" in value
    ) {
      const record = value as Partial<ActiveManifestRecord>;
      if (record.version !== 1 || typeof record.sourceUrl !== "string")
        throw new Error("Invalid active asset manifest record");
      return parseAssetManifest(record.manifest, record.sourceUrl);
    }
    // One-way compatibility with the original raw-manifest pointer.
    return parseAssetManifest(value);
  } catch (error) {
    try {
      localStorage.removeItem(ACTIVE_MANIFEST_KEY);
    } catch {
      // A blocked storage area must not prevent the packaged manifest from
      // loading on a privacy-restricted browser.
    }
    recordDiagnostic("warn", "assets.manifest.invalid", error);
    return undefined;
  }
}

function writeActiveAssetManifest(
  manifest: AssetManifestV1,
  sourceUrl = assetManifestUrl(),
): void {
  if (typeof window === "undefined") return;
  // localStorage.setItem replaces the pointer in one operation. The old
  // pointer remains intact if serialization or quota validation fails.
  const record: ActiveManifestRecord = {
    version: 1,
    sourceUrl,
    manifest,
  };
  localStorage.setItem(ACTIVE_MANIFEST_KEY, JSON.stringify(record));
}

/**
 * Stage only changed local/core resources, verify every byte through the
 * BrowserAssetStore, then publish the new manifest pointer. Old resources are
 * removed only after the new pointer is active, so a failed update never
 * strands the last known-good pack.
 */
export async function applyAssetManifestUpdate(
  previous: AssetManifestV1 | undefined,
  next: AssetManifestV1,
  options: {
    signal?: AbortSignal;
    forceAll?: boolean;
    sourceUrl?: string;
    onProgress?: (completed: number, total: number) => void;
  } = {},
): Promise<AssetManifestDiff> {
  const validated = parseAssetManifest(next);
  const diff = previous
    ? compareAssetManifests(previous, validated)
    : {
        added: validated.items,
        changed: [],
        removed: [],
        unchanged: 0,
        hasUpdate: validated.items.length > 0,
      };
  const changedLocal = (
    options.forceAll ? validated.items : [...diff.added, ...diff.changed]
  ).filter((item) => item.source === "local");
  if (changedLocal.length > 0) {
    await assetStore.installPack(
      changedLocal,
      options.signal,
      options.onProgress,
    );
  }
  writeActiveAssetManifest(validated, options.sourceUrl);
  if (previous) {
    const cleanup = await Promise.allSettled(
      diff.removed
        .filter((item) => item.source === "local")
        .map((item) => assetStore.remove(item)),
    );
    for (const result of cleanup) {
      if (result.status === "rejected")
        recordDiagnostic("warn", "assets.manifest.cleanup", result.reason);
    }
  }
  return diff;
}
