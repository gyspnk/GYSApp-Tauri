import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const files = [
  ["bible-tb", "offline/bible/b_tb.db"],
  ["bible-tb-reader", "offline/bible/tb-reader.json"],
  ["hymn-catalog", "offline/hymn-catalog.json"],
  ["music-lock", "offline/music-lock.json"],
  ["faith-topics", "offline/faith.json"],
  ["sauh-feed", "offline/sauh.json"],
  ["literature-catalog", "offline/literature.json"],
  ["suara-sejati", "offline/suara-sejati.json"],
  ["fork-hymnal-map", "offline/fork-hymnal-manifest.json"],
  ["soundfont-timgm", "offline/soundfont/TimGM6mb.sf2"],
];
await mkdir(join("apps", "web", "public", "offline"), { recursive: true });
await copyFile(
  join("packages", "contracts", "generated", "hymn-catalog.json"),
  join("apps", "web", "public", "offline", "hymn-catalog.json"),
);
await copyFile(
  join("packages", "contracts", "generated", "upstream-music-lock.json"),
  join("apps", "web", "public", "offline", "music-lock.json"),
);
const items = [];
for (const [id, relative] of files) {
  const bytes = await readFile(join("apps", "web", "public", relative));
  items.push({
    id,
    path: relative,
    bytes: bytes.byteLength,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const catalog = JSON.parse(
  await readFile(
    join("packages", "contracts", "generated", "hymn-catalog.json"),
    "utf8",
  ),
);
const generatedAt = new Date().toISOString();
const bibleItem = items.find((item) => item.id === "bible-tb");
if (!bibleItem) throw new Error("bible-tb item was not generated");
await writeFile(
  join("apps", "web", "public", "offline", "bible", "manifest.json"),
  `${JSON.stringify(
    {
      version: "1",
      translation: "TB",
      generatedAt,
      sha256: bibleItem.sha256,
      bytes: bibleItem.bytes,
      books: 66,
    },
    null,
    2,
  )}\n`,
  "utf8",
);
await writeFile(
  join("apps", "web", "public", "offline", "pack-manifest.json"),
  `${JSON.stringify({ version: 1, generatedAt, bible: "TB", hymns: catalog.items.length, items }, null, 2)}\n`,
  "utf8",
);

const localKind = new Map([
  ["bible-tb", "bible"],
  ["bible-tb-reader", "bible"],
  ["hymn-catalog", "hymn-catalog"],
  ["music-lock", "pack"],
  ["faith-topics", "pack"],
  ["sauh-feed", "pack"],
  ["literature-catalog", "pack"],
  ["suara-sejati", "pack"],
  ["fork-hymnal-map", "pack"],
  ["soundfont-timgm", "soundfont"],
]);
const assetItems = items.map((item) => ({
  id: item.id,
  kind: localKind.get(item.id) ?? "pack",
  source: "local",
  path: item.path,
  version: item.sha256,
  sha256: item.sha256,
  bytes: item.bytes,
  status: "available",
  lastUpdated: generatedAt,
}));
const literature = JSON.parse(
  await readFile(
    join("apps", "web", "public", "offline", "literature.json"),
    "utf8",
  ),
);
const sauh = JSON.parse(
  await readFile(join("apps", "web", "public", "offline", "sauh.json"), "utf8"),
);
const suara = JSON.parse(
  await readFile(
    join("apps", "web", "public", "offline", "suara-sejati.json"),
    "utf8",
  ),
);
const remoteImages = new Map();
for (const item of literature.items ?? []) {
  if (typeof item.imageUrl === "string")
    remoteImages.set(item.imageUrl, {
      id: `literature-cover:${item.id}`,
      kind: "cover",
      version: item.updatedAt,
      lastUpdated: item.updatedAt,
    });
}
for (const item of sauh.items ?? []) {
  if (typeof item.imageUrl === "string")
    remoteImages.set(item.imageUrl, {
      id: `sauh-cover:${item.id}`,
      kind: "cover",
      version: item.updatedAt,
      lastUpdated: item.updatedAt,
    });
}
for (const item of suara.items ?? []) {
  if (typeof item.imageUrl === "string")
    remoteImages.set(item.imageUrl, {
      id: `suara-thumbnail:${item.id}`,
      kind: "thumbnail",
      version: item.publishedAt,
      lastUpdated: item.publishedAt,
    });
}
for (const [url, item] of remoteImages) {
  assetItems.push({
    ...item,
    source: "remote",
    path: url,
    url,
    status: "remote",
  });
}
await writeFile(
  join("apps", "web", "public", "offline", "asset-manifest.json"),
  `${JSON.stringify({ version: 1, generatedAt, items: assetItems }, null, 2)}\n`,
  "utf8",
);
console.log(
  `Generated offline pack and asset manifests for ${catalog.items.length} hymns (${assetItems.length} assets).`,
);
