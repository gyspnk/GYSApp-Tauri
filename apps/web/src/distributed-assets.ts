import {
  DistributedAssetCatalogSchema,
  DistributedAssetPackageSchema,
  DistributedAssetTrackManifestSchema,
  type DistributedAssetCatalog,
  type DistributedAssetCatalogItem,
  type DistributedAssetKind,
  type DistributedAssetTrack,
} from "@gys/contracts";

export const DISTRIBUTED_ASSET_MANIFEST_URLS = {
  bibles:
    "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/bibles-manifest.json",
  hymnals:
    "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/hymnals-manifest.json",
  soundfont:
    "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/soundfont-manifest.json",
} as const satisfies Record<DistributedAssetTrack, string>;

export const DISTRIBUTED_ASSET_DEFINITIONS = [
  {
    code: "b_tb",
    kind: "bible",
    title: "Terjemahan Baru",
    bundledByDefault: true,
  },
  {
    code: "b_kjv",
    kind: "bible",
    title: "King James Version",
    bundledByDefault: false,
  },
  {
    code: "b_cuv",
    kind: "bible",
    title: "Chinese Union Version",
    bundledByDefault: false,
  },
  {
    code: "KR",
    kind: "hymnal",
    title: "Kidung Rohani",
    bundledByDefault: true,
  },
  {
    code: "HYMNE",
    kind: "hymnal",
    title: "Hymne (English Version)",
    bundledByDefault: false,
    metadata: {
      sourceRepo: "ThenGB/GYSAPP-Fork",
      sourceCommit: "4f0d39b",
      path: "assets/data/index/hymne_index.json",
      downloadUrl:
        "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/hymne_index.json",
      sizeBytes: 740939,
      checksumSha256:
        "bc89b27b1fac68f584161c3f5e91e416bf4580106a05efc6dc96a14140e0fba3",
    },
  },
  {
    code: "MDR",
    kind: "hymnal",
    title: "Mandarin",
    bundledByDefault: false,
    metadata: {
      sourceRepo: "ThenGB/GYSAPP-Fork",
      sourceCommit: "4f0d39b",
      path: "assets/data/index/mdr_index.json",
      downloadUrl:
        "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/mdr_index.json",
      sizeBytes: 636392,
      checksumSha256:
        "8b0d298bb5900c0ea9cfe2e4d53b47a1088a9e322e4b38ffe7b4542c5e7d4dfa",
    },
  },
  {
    code: "ASM-I",
    kind: "hymnal",
    title: "Aku Senang Menyanyi I",
    bundledByDefault: false,
    metadata: {
      sourceRepo: "ThenGB/GYSAPP-Fork",
      sourceCommit: "4f0d39b",
      path: "assets/data/index/asm_i_index.json",
      downloadUrl:
        "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/asm_i_index.json",
      sizeBytes: 45562,
      checksumSha256:
        "d3d9d4e865c7f3465fc75766b0ee048865b427d43e5042984a647c863763fa0e",
    },
  },
  {
    code: "ASM-M",
    kind: "hymnal",
    title: "Aku Senang Menyanyi M",
    bundledByDefault: false,
    metadata: {
      sourceRepo: "ThenGB/GYSAPP-Fork",
      sourceCommit: "4f0d39b",
      path: "assets/data/index/asm_m_index.json",
      downloadUrl:
        "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/asm_m_index.json",
      sizeBytes: 56106,
      checksumSha256:
        "d058e51bcb0c720729322effaf0d989893bfc37a4bfbb4c6b7a531bac3fa1917",
    },
  },
  {
    code: "ASM-P",
    kind: "hymnal",
    title: "Aku Senang Menyanyi P",
    bundledByDefault: false,
    metadata: {
      sourceRepo: "ThenGB/GYSAPP-Fork",
      sourceCommit: "4f0d39b",
      path: "assets/data/index/asm_p_index.json",
      downloadUrl:
        "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/asm_p_index.json",
      sizeBytes: 54893,
      checksumSha256:
        "1470f8af2d6a28074454b587319adcaaf6ad95c0b0d0a0690d4d747e9b855c8c",
    },
  },
  {
    code: "GeneralUser-GS",
    kind: "soundfont",
    title: "GeneralUser-GS SoundFont",
    bundledByDefault: false,
  },
] as const satisfies ReadonlyArray<{
  code: string;
  kind: DistributedAssetKind;
  title: string;
  bundledByDefault: boolean;
  metadata?: {
    sourceRepo: "ThenGB/GYSAPP-Fork";
    sourceCommit: string;
    path: string;
    downloadUrl: string;
    sizeBytes: number;
    checksumSha256: string;
  };
}>;

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
