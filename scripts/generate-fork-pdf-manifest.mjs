import { mkdir, readFile, writeFile } from "node:fs/promises";
const root = process.env.GYSAPP_FORK_SNAPSHOT;
const sourceCommit = process.env.GYSAPP_FORK_COMMIT ?? "4f0d39b";
if (!root)
  throw new Error(
    "Set GYSAPP_FORK_SNAPSHOT to an immutable GYSAPP-Fork snapshot.",
  );
const raw = JSON.parse(
  await readFile(`${root}/assets/data/index/kr_pdf_manifest.json`, "utf8"),
);
const manifest = {
  sourceRepo: "ThenGB/GYSApp-Data",
  sourceCommit,
  generatedAt: new Date().toISOString(),
  bookCode: "KR",
  masterPath: raw.masterPath,
  pageCount: raw.pageCount,
  songs: raw.songs,
};
await mkdir("apps/web/public/offline", { recursive: true });
await writeFile(
  "apps/web/public/offline/fork-hymnal-manifest.json",
  `${JSON.stringify(manifest, null, 2)}\n`,
);
console.log(
  `Generated fork PDF manifest for ${Object.keys(raw.songs).length} songs.`,
);
