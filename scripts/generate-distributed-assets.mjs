import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(root, "apps/web/public/offline/distributed-assets.json");
const config = JSON.parse(
  await readFile(
    resolve(root, "packages/contracts/src/distributed-assets.json"),
    "utf8",
  ),
);

const kindByTrack = {
  bibles: "bible",
  hymnals: "hymnal",
  soundfont: "soundfont",
};
const tracks = Object.entries(config.manifestUrls).map(([track, url]) => ({
  track,
  kind: kindByTrack[track],
  url,
}));
const definitions = new Map(
  config.definitions.map((definition) => [definition.code, definition]),
);

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Manifest request failed: ${url} (${response.status})`);
  return JSON.parse((await response.text()).replace(/^\uFEFF/, ""));
}

await Promise.all(
  config.definitions
    .filter((definition) => definition.metadata)
    .map(async ({ code, metadata }) => {
      const response = await fetch(metadata.downloadUrl, {
        headers: { accept: "application/json" },
      });
      if (!response.ok)
        throw new Error(
          `Metadata request failed for ${code}: ${response.status}`,
        );
      const bytes = new Uint8Array(await response.arrayBuffer());
      const checksumSha256 = createHash("sha256").update(bytes).digest("hex");
      if (
        bytes.byteLength !== metadata.sizeBytes ||
        checksumSha256 !== metadata.checksumSha256.toLowerCase()
      ) {
        throw new Error(
          `Metadata integrity mismatch for ${code}: expected ${metadata.sizeBytes} bytes/${metadata.checksumSha256}, received ${bytes.byteLength} bytes/${checksumSha256}`,
        );
      }
    }),
);

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
    const metadata = definition.metadata;
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
