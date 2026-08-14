import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

const files = [
  ["bible-tb", "offline/bible/b_tb.db"],
  ["soundfont-timgm", "offline/soundfont/TimGM6mb.sf2"],
];
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
await mkdir(join("apps", "web", "public", "offline"), { recursive: true });
await writeFile(
  join("apps", "web", "public", "offline", "pack-manifest.json"),
  `${JSON.stringify({ version: 1, generatedAt: new Date().toISOString(), bible: "TB", hymns: catalog.items.length, items }, null, 2)}\n`,
  "utf8",
);
console.log(
  `Generated offline pack manifest for ${catalog.items.length} hymns.`,
);
