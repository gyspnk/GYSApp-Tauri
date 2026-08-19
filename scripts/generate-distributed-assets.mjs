import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "apps/web/public/offline/distributed-assets.json");

const tracks = [
  {
    track: "bibles",
    kind: "bible",
    url: "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/bibles-manifest.json",
  },
  {
    track: "hymnals",
    kind: "hymnal",
    url: "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/hymnals-manifest.json",
  },
  {
    track: "soundfont",
    kind: "soundfont",
    url: "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/soundfont-manifest.json",
  },
];

const definitions = new Map([
  ["b_tb", { title: "Terjemahan Baru", bundledByDefault: true }],
  ["b_kjv", { title: "King James Version", bundledByDefault: false }],
  ["b_cuv", { title: "Chinese Union Version", bundledByDefault: false }],
  ["KR", { title: "Kidung Rohani", bundledByDefault: true }],
  [
    "HYMNE",
    {
      title: "Hymne (English Version)",
      bundledByDefault: false,
      index: [
        "hymne_index.json",
        740939,
        "bc89b27b1fac68f584161c3f5e91e416bf4580106a05efc6dc96a14140e0fba3",
      ],
    },
  ],
  [
    "MDR",
    {
      title: "Mandarin",
      bundledByDefault: false,
      index: [
        "mdr_index.json",
        636392,
        "8b0d298bb5900c0ea9cfe2e4d53b47a1088a9e322e4b38ffe7b4542c5e7d4dfa",
      ],
    },
  ],
  [
    "ASM-I",
    {
      title: "Aku Senang Menyanyi I",
      bundledByDefault: false,
      index: [
        "asm_i_index.json",
        45562,
        "d3d9d4e865c7f3465fc75766b0ee048865b427d43e5042984a647c863763fa0e",
      ],
    },
  ],
  [
    "ASM-M",
    {
      title: "Aku Senang Menyanyi M",
      bundledByDefault: false,
      index: [
        "asm_m_index.json",
        56106,
        "d058e51bcb0c720729322effaf0d989893bfc37a4bfbb4c6b7a531bac3fa1917",
      ],
    },
  ],
  [
    "ASM-P",
    {
      title: "Aku Senang Menyanyi P",
      bundledByDefault: false,
      index: [
        "asm_p_index.json",
        54893,
        "1470f8af2d6a28074454b587319adcaaf6ad95c0b0d0a0690d4d747e9b855c8c",
      ],
    },
  ],
  [
    "GeneralUser-GS",
    { title: "GeneralUser-GS SoundFont", bundledByDefault: false },
  ],
]);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Manifest request failed: ${url} (${response.status})`);
  return JSON.parse((await response.text()).replace(/^\uFEFF/, ""));
}

const manifests = await Promise.all(
  tracks.map(async (track) => ({
    ...track,
    manifest: await fetchJson(track.url),
  })),
);

const items = manifests.flatMap(({ kind, track, manifest }) => {
  if (manifest.track !== track || !Array.isArray(manifest.packages)) {
    throw new Error(`Unexpected ${track} manifest shape`);
  }
  return manifest.packages.map((asset) => {
    const definition = definitions.get(asset.code);
    if (!definition)
      throw new Error(`Unsupported distributed asset: ${asset.code}`);
    const metadata = definition.index
      ? {
          sourceRepo: "ThenGB/GYSAPP-Fork",
          sourceCommit: "4f0d39b",
          path: `assets/data/index/${definition.index[0]}`,
          downloadUrl: `https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/${definition.index[0]}`,
          sizeBytes: definition.index[1],
          checksumSha256: definition.index[2],
        }
      : undefined;
    return {
      kind,
      code: asset.code,
      title: definition.title,
      track,
      bundledByDefault: definition.bundledByDefault,
      version: asset.version,
      releaseTag: manifest.releaseTag,
      fileName: asset.fileName,
      downloadUrl: asset.downloadUrl,
      installFileName: asset.installFileName,
      sizeBytes: asset.sizeBytes,
      checksumSha256: asset.checksumSha256.toLowerCase(),
      ...(metadata ? { metadata } : {}),
    };
  });
});

items.sort((left, right) => {
  const leftOrder = [...definitions.keys()].indexOf(left.code);
  const rightOrder = [...definitions.keys()].indexOf(right.code);
  return leftOrder - rightOrder;
});

const generatedAt = manifests
  .map(({ manifest }) => Date.parse(manifest.publishedAt))
  .filter(Number.isFinite)
  .reduce((latest, value) => Math.max(latest, value), 0);

const catalog = {
  version: 1,
  generatedAt: new Date(generatedAt || Date.now()).toISOString(),
  sourceRepo: "ThenGB/GYSApp-Data",
  items,
};

await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(`Generated ${items.length} distributed assets: ${output}`);
