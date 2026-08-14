import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const lock = await readJson(
  "packages/contracts/generated/upstream-music-lock.json",
);
const chord = await readJson(
  "packages/contracts/generated/chord-manifest.json",
);
const hymns = await readJson("packages/contracts/generated/hymn-catalog.json");
const pack = await readJson("apps/web/public/offline/pack-manifest.json");

if (
  lock.sourceRepo !== "gyspnk/gyschordweb" ||
  lock.sourceCommit !== "cbc7d386"
)
  throw new Error("music lock provenance drifted");
if (lock.items.length !== 1208)
  throw new Error(`expected 1208 music entries, got ${lock.items.length}`);
if (chord.sourceCommit !== lock.sourceCommit || chord.entries.length !== 140)
  throw new Error("chord manifest drifted from music lock");
if (hymns.sourceCommit !== lock.sourceCommit || hymns.items.length !== 533)
  throw new Error("hymn catalog drifted from music lock");
if (pack.hymns !== hymns.items.length)
  throw new Error("offline pack hymn count drifted");

for (const item of pack.items) {
  const bytes = await readFile(join("apps/web/public", item.path));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== item.bytes || sha256 !== item.sha256)
    throw new Error(`offline pack integrity drift: ${item.id}`);
}

console.log(
  `Generated provenance verified: ${lock.items.length} music items, ${hymns.items.length} hymns, ${pack.items.length} offline assets.`,
);
