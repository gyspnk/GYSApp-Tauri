import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { assertEgysLocalOnly } from "./verify-egys-local-only.mjs";

await assertEgysLocalOnly(process.cwd());

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const listFiles = async (root) => {
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
};
const lock = await readJson(
  "packages/contracts/generated/upstream-music-lock.json",
);
const chord = await readJson(
  "packages/contracts/generated/chord-manifest.json",
);
const chordAudit = await readJson("docs/discovery/chord-position-audit.json");
const hymns = await readJson("packages/contracts/generated/hymn-catalog.json");
const pack = await readJson("apps/web/public/offline/pack-manifest.json");
const literature = await readJson("apps/web/public/offline/literature.json");
const assets = await readJson("apps/web/public/offline/asset-manifest.json");
const distributedAssets = await readJson(
  "apps/web/public/offline/distributed-assets.json",
);
const forkPdf = await readJson(
  "apps/web/public/offline/fork-hymnal-manifest.json",
);
const forkPdfSource = await readFile("apps/bff/src/fork-pdf-source.ts", "utf8");
const sourceField = (field, value) =>
  forkPdfSource.includes(`${field}: ${value}`) ||
  forkPdfSource.includes(`"${field}": ${value}`);

if (lock.sourceRepo !== "gyspnk/gyschordweb" || lock.sourceCommit !== "a3d1ea7")
  throw new Error("music lock provenance drifted");
if (lock.items.length !== 1212)
  throw new Error(`expected 1212 music entries, got ${lock.items.length}`);
if (chord.sourceCommit !== lock.sourceCommit || chord.entries.length !== 144)
  throw new Error("chord manifest drifted from music lock");
if (
  chordAudit.version !== 1 ||
  chordAudit.sourceRepo !== lock.sourceRepo ||
  chordAudit.sourceCommit !== lock.sourceCommit ||
  chordAudit.musicLockPath !== "apps/web/public/offline/music-lock.json" ||
  chordAudit.chordCount !== chord.entries.length ||
  chordAudit.totals?.orphanEntries !== 0 ||
  chordAudit.totals?.invalidEntries !== 0 ||
  !Array.isArray(chordAudit.files) ||
  chordAudit.files.length !== chord.entries.length
)
  throw new Error("chord position audit is missing or drifted");
const chordAuditBySong = new Map(
  chordAudit.files.map((file) => [file.songId, file]),
);
for (const entry of chord.entries) {
  const audit = chordAuditBySong.get(entry.songId);
  if (
    !audit ||
    audit.chordPath !== entry.path ||
    audit.chordBytes !== entry.size ||
    audit.chordSha256 !== entry.sha256 ||
    audit.invalidEntries !== 0 ||
    audit.orphanEntries !== 0 ||
    audit.mappedEntries + audit.orphanEntries + audit.invalidEntries !==
      audit.pageResults.reduce((total, page) => total + page.chordEntries, 0)
  )
    throw new Error(`chord position audit drift: ${entry.songId}`);
}
if (hymns.sourceCommit !== lock.sourceCommit || hymns.items.length !== 533)
  throw new Error("hymn catalog drifted from music lock");
if (
  forkPdf.sourceRepo !== "ThenGB/GYSAPP-Fork" ||
  forkPdf.sourceCommit !== "4f0d39b" ||
  forkPdf.masterPath !== "assets/data/pdf/kr/kr_master.pdf" ||
  forkPdf.bookCode !== "KR" ||
  forkPdf.pageCount !== 649 ||
  forkPdf.sizeBytes !== 4770376 ||
  forkPdf.sha256 !==
    "5ea1d857cac8a8d52600052ef3a7b22214919ffaefe4f0f97c71d6f57f5f8805" ||
  !forkPdf.songs ||
  Object.keys(forkPdf.songs).length !== 533 ||
  !sourceField("sourceCommit", '"4f0d39b"') ||
  !sourceField("masterPath", '"assets/data/pdf/kr/kr_master.pdf"') ||
  !sourceField("sizeBytes", "4770376") ||
  !sourceField(
    "sha256",
    '"5ea1d857cac8a8d52600052ef3a7b22214919ffaefe4f0f97c71d6f57f5f8805"',
  )
)
  throw new Error("GYSApp-Fork PDF provenance drifted");
if (pack.hymns !== hymns.items.length)
  throw new Error("offline pack hymn count drifted");
if (
  pack.items.some((item) => /\.(?:gyspkg|sf2)$/i.test(item.path)) ||
  existsSync("apps/web/public/offline/distributed-hymn-catalog.json") ||
  (await listFiles("apps/web/dist")).some(
    (path) =>
      /\.(?:gyspkg|sf2)$/i.test(path) ||
      path.endsWith("distributed-hymn-catalog.json"),
  )
)
  throw new Error("optional distributed assets leaked into the initial pack");
if (
  distributedAssets.version !== 1 ||
  distributedAssets.sourceRepo !== "ThenGB/GYSApp-Data" ||
  !Array.isArray(distributedAssets.items) ||
  !["b_kjv", "b_cuv", "HYMNE", "MDR", "ASM-I", "ASM-M", "ASM-P"].every((code) =>
    distributedAssets.items.some(
      (item) =>
        item.code === code &&
        item.downloadUrl?.startsWith(
          "https://github.com/ThenGB/GYSApp-Data/releases/download/",
        ) &&
        (item.kind !== "hymnal" ||
          (item.metadata?.sourceRepo === "ThenGB/GYSAPP-Fork" &&
            item.metadata?.sourceCommit === "4f0d39b")),
    ),
  )
)
  throw new Error("distributed asset catalog is incomplete or untrusted");
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
    !(
      item.url?.startsWith("https://tjc.org/") ||
      item.url?.startsWith("https://tjcorguploads.s3.amazonaws.com/")
    ) ||
    !/^(?:https:\/\/tjc\.org\/|https:\/\/tjcorguploads\.s3\.amazonaws\.com\/)/.test(
      item.path,
    )
  ) {
    throw new Error(
      `asset manifest remote source is not allowlisted: ${item.id}`,
    );
  }
}

console.log(
  `Generated provenance verified: ${lock.items.length} music items, ${hymns.items.length} hymns, ${pack.items.length} offline assets, ${literature.items.filter((item) => item.imageUrl).length}/${literature.items.length} literature covers.`,
);
