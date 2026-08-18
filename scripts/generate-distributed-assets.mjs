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
  ["HYMNE", { title: "Hymne (English Version)", bundledByDefault: false }],
  ["MDR", { title: "Mandarin", bundledByDefault: false }],
  ["ASM-I", { title: "Aku Senang Menyanyi I", bundledByDefault: false }],
  ["ASM-M", { title: "Aku Senang Menyanyi M", bundledByDefault: false }],
  ["ASM-P", { title: "Aku Senang Menyanyi P", bundledByDefault: false }],
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
