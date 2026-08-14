import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "apps", "web", "dist", "assets");
const files = await readdir(dist);
const javascript = files.filter(
  (file) => file.endsWith(".js") || file.endsWith(".mjs"),
);
if (javascript.length === 0) throw new Error("No web JavaScript assets found");

const rows = await Promise.all(
  javascript.map(async (file) => {
    const bytes = await readFile(join(dist, file));
    return {
      file,
      bytes: bytes.byteLength,
      gzip: gzipSync(bytes, { level: 9 }).byteLength,
    };
  }),
);
rows.sort((left, right) => right.gzip - left.gzip);
const initial = rows.filter(
  ({ file }) => !file.includes("pdf") && !file.includes("worker"),
);
const main = rows.find(({ file }) => file.startsWith("index-"));
const mainLimit = 250 * 1024;
if (!main || main.gzip > mainLimit) {
  throw new Error(
    `Initial application chunk exceeds 250 KiB gzip: ${main?.file ?? "missing"} (${main?.gzip ?? 0} bytes)`,
  );
}

const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
console.log("Web bundle budget (gzip):");
for (const row of rows.slice(0, 12))
  console.log(`  ${row.file}: ${format(row.gzip)} (${format(row.bytes)} raw)`);
console.log(
  `Initial JS gzip total: ${format(initial.reduce((sum, row) => sum + row.gzip, 0))}`,
);
console.log(`Budget: ${format(mainLimit)} for ${main.file}`);
