import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";

const files = [
  ["bible-tb", "offline/bible/b_tb.db"],
  ["bible-tb-reader", "offline/bible/tb-reader.json"],
  ["hymn-catalog", "offline/hymn-catalog.json"],
  ["music-lock", "offline/music-lock.json"],
  ["faith-topics", "offline/faith.json"],
  ["literature-catalog", "offline/literature.json"],
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
console.log(
  `Generated offline pack manifest for ${catalog.items.length} hymns.`,
);
