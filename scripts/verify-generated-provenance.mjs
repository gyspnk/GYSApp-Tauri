import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { assertEgysLocalOnly } from "./verify-egys-local-only.mjs";

await assertEgysLocalOnly(process.cwd());

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const lock = await readJson(
  "packages/contracts/generated/upstream-music-lock.json",
);
const chord = await readJson(
  "packages/contracts/generated/chord-manifest.json",
);
const hymns = await readJson("packages/contracts/generated/hymn-catalog.json");
const pack = await readJson("apps/web/public/offline/pack-manifest.json");
const literature = await readJson("apps/web/public/offline/literature.json");
const assets = await readJson("apps/web/public/offline/asset-manifest.json");

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
if (literature.source !== "tjc.org" || literature.items.length < 1)
  throw new Error("literature snapshot is invalid");
if (
  assets.version !== 1 ||
  !Array.isArray(assets.items) ||
  assets.items.length < pack.items.length
)
  throw new Error("asset manifest is invalid");
if (
  !assets.items.some(
    (item) =>
      item.source === "local" &&
      item.kind === "pdf" &&
      item.path === "assets/pdf/001_Pujilah Allah Yang Maha Esa.pdf",
  )
)
  throw new Error("bundled music seed is missing from the asset manifest");
for (const item of literature.items) {
  if (
    item.imageUrl &&
    (!item.imageUrl.startsWith("https://tjc.org/") ||
      !/\.(?:avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(item.imageUrl))
  )
    throw new Error(`literature cover source is invalid: ${item.id}`);
}

for (const item of pack.items) {
  const bytes = await readFile(join("apps/web/public", item.path));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (bytes.byteLength !== item.bytes || sha256 !== item.sha256)
    throw new Error(`offline pack integrity drift: ${item.id}`);
}

for (const item of assets.items) {
  if (
    typeof item.id !== "string" ||
    !item.id ||
    !["local", "remote"].includes(item.source) ||
    typeof item.path !== "string" ||
    typeof item.version !== "string" ||
    !["available", "remote", "pinned", "stale"].includes(item.status)
  )
    throw new Error(`asset manifest entry is invalid: ${item.id ?? "unknown"}`);
  if (item.source === "local") {
    const bytes = await readFile(join("apps/web/public", item.path));
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (
      bytes.byteLength !== item.bytes ||
      sha256 !== item.sha256 ||
      item.version !== sha256
    )
      throw new Error(`asset manifest integrity drift: ${item.id}`);
  } else if (
    !item.url?.startsWith("https://tjc.org/") ||
    !/^https:\/\/tjc\.org\//.test(item.path)
  ) {
    throw new Error(
      `asset manifest remote source is not allowlisted: ${item.id}`,
    );
  }
}

console.log(
  `Generated provenance verified: ${lock.items.length} music items, ${hymns.items.length} hymns, ${pack.items.length} offline assets, ${literature.items.filter((item) => item.imageUrl).length}/${literature.items.length} literature covers.`,
);
