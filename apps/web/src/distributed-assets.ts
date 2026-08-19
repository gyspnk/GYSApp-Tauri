import {
  DISTRIBUTED_ASSET_CONFIG,
  DistributedAssetCatalogSchema,
  DistributedAssetPackageSchema,
  DistributedAssetTrackManifestSchema,
  type DistributedAssetCatalog,
  type DistributedAssetCatalogItem,
  type DistributedAssetKind,
  type DistributedAssetTrack,
} from "@gys/contracts";

export const DISTRIBUTED_ASSET_MANIFEST_URLS =
  DISTRIBUTED_ASSET_CONFIG.manifestUrls;
export const DISTRIBUTED_ASSET_DEFINITIONS =
  DISTRIBUTED_ASSET_CONFIG.definitions;

const definitionByCode = new Map<
  string,
  (typeof DISTRIBUTED_ASSET_DEFINITIONS)[number]
>(
  DISTRIBUTED_ASSET_DEFINITIONS.map((definition) => [
    definition.code,
    definition,
  ]),
);

type TrackManifestInput = Record<DistributedAssetTrack, unknown>;

export type DistributedAssetCatalogLoaderOptions = {
  fetcher?: typeof fetch;
  fallback?: unknown;
  urls?: Partial<Record<DistributedAssetTrack, string>>;
};

function manifestTrackForKind(
  kind: DistributedAssetKind,
): DistributedAssetTrack {
  switch (kind) {
    case "bible":
      return "bibles";
    case "hymnal":
      return "hymnals";
    case "soundfont":
      return "soundfont";
  }
}

function isTrustedPackageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "github.com" &&
      /^\/ThenGB\/GYSApp-Data\/releases\/download\/[^/]+\/[^/]+$/.test(
        url.pathname,
      )
    );
  } catch {
    return false;
  }
}

function assertTrustedPackageUrl(value: string): void {
  if (!isTrustedPackageUrl(value)) {
    throw new Error(`Untrusted distributed asset URL: ${value}`);
  }
}

function normalizeManifestItem(
  track: DistributedAssetTrack,
  manifest: ReturnType<typeof DistributedAssetTrackManifestSchema.parse>,
  rawPackage: unknown,
): DistributedAssetCatalogItem {
  const pkg = DistributedAssetPackageSchema.parse(rawPackage);
  assertTrustedPackageUrl(pkg.downloadUrl);
  const definition = definitionByCode.get(pkg.code);
  if (!definition)
    throw new Error(`Unsupported distributed asset: ${pkg.code}`);
  if (
    manifest.track !== track ||
    manifestTrackForKind(definition.kind) !== track
  ) {
    throw new Error(`Distributed asset track mismatch: ${pkg.code}`);
  }

  return {
    kind: definition.kind,
    code: definition.code,
    title: definition.title,
    track,
    bundledByDefault: definition.bundledByDefault,
    version: pkg.version,
    releaseTag: manifest.releaseTag,
    fileName: pkg.fileName,
    downloadUrl: pkg.downloadUrl,
    installFileName: pkg.installFileName,
    sizeBytes: pkg.sizeBytes,
    checksumSha256: pkg.checksumSha256.toLowerCase(),
    ...("metadata" in definition && definition.metadata
      ? { metadata: definition.metadata }
      : {}),
  };
}

function generatedAtFromManifests(
  manifests: Array<
    ReturnType<typeof DistributedAssetTrackManifestSchema.parse>
  >,
): string {
  const latest = Math.max(
    ...manifests.map((manifest) => Date.parse(manifest.publishedAt)),
  );
  if (!Number.isFinite(latest))
    throw new Error("Distributed manifest date is invalid");
  return new Date(latest).toISOString();
}

export function normalizeDistributedManifests(
  value: TrackManifestInput,
): DistributedAssetCatalog {
  const tracks = ["bibles", "hymnals", "soundfont"] as const;
  const parsed = tracks.map((track) => {
    const manifest = DistributedAssetTrackManifestSchema.parse(value[track]);
    if (manifest.track !== track) {
      throw new Error(`Distributed manifest track mismatch: ${track}`);
    }
    return manifest;
  });
  const items = parsed.flatMap((manifest, index) =>
    manifest.packages.map((pkg) =>
      normalizeManifestItem(tracks[index]!, manifest, pkg),
    ),
  );
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.code)) {
      throw new Error(`Duplicate distributed asset code: ${item.code}`);
    }
    seen.add(item.code);
  }
  return parseDistributedAssetCatalog({
    version: 1,
    generatedAt: generatedAtFromManifests(parsed),
    sourceRepo: "ThenGB/GYSApp-Data",
    items,
  });
}

export function parseDistributedAssetCatalog(
  value: unknown,
): DistributedAssetCatalog {
  const catalog = DistributedAssetCatalogSchema.parse(value);
  const seen = new Set<string>();
  for (const item of catalog.items) {
    if (seen.has(item.code)) {
      throw new Error(`Duplicate distributed asset code: ${item.code}`);
    }
    seen.add(item.code);
    assertTrustedPackageUrl(item.downloadUrl);
  }
  return catalog;
}

function fallbackCatalogUrl(): string {
  return `${import.meta.env.BASE_URL.replace(/\/$/, "")}/offline/distributed-assets.json`;
}

async function readJson(fetcher: typeof fetch, url: string): Promise<unknown> {
  const response = await fetcher(url, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Distributed manifest request failed: ${response.status}`);
  return response.json();
}

export async function loadBundledDistributedAssetCatalog(
  fetcher: typeof fetch = fetch,
): Promise<DistributedAssetCatalog> {
  return parseDistributedAssetCatalog(
    await readJson(fetcher, fallbackCatalogUrl()),
  );
}

export async function loadDistributedAssetCatalog(
  options: DistributedAssetCatalogLoaderOptions = {},
): Promise<DistributedAssetCatalog> {
  const fetcher = options.fetcher ?? fetch;
  const urls = { ...DISTRIBUTED_ASSET_MANIFEST_URLS, ...options.urls };
  try {
    const [bibles, hymnals, soundfont] = await Promise.all([
      readJson(fetcher, urls.bibles!),
      readJson(fetcher, urls.hymnals!),
      readJson(fetcher, urls.soundfont!),
    ]);
    return normalizeDistributedManifests({ bibles, hymnals, soundfont });
  } catch (error) {
    if (options.fallback !== undefined)
      return parseDistributedAssetCatalog(options.fallback);
    return parseDistributedAssetCatalog(
      await readJson(fetcher, fallbackCatalogUrl()),
    );
  }
}
