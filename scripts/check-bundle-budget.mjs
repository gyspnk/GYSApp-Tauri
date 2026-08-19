import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const dist = join(process.cwd(), "apps", "web", "dist", "assets");
const html = await readFile(
  join(process.cwd(), "apps", "web", "dist", "index.html"),
  "utf8",
);
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
const initialFiles = new Set(
  [...html.matchAll(/(?:src|href)="[^"]*\/assets\/([^"]+\.(?:js|mjs))"/g)].map(
    (match) => match[1],
  ),
);
const initial = rows.filter(({ file }) => initialFiles.has(file));
if (!initial.length || initial.length !== initialFiles.size)
  throw new Error("Unable to resolve the initial JavaScript graph");
const main = rows.find(({ file }) => file.startsWith("index-"));
const mainLimit = 250 * 1024;
if (!main || main.gzip > mainLimit) {
  throw new Error(
    `Initial application chunk exceeds 250 KiB gzip: ${main?.file ?? "missing"} (${main?.gzip ?? 0} bytes)`,
  );
}
const initialTotal = initial.reduce((sum, row) => sum + row.gzip, 0);
const initialLimit = 180 * 1024;
if (initialTotal > initialLimit)
  throw new Error(
    `Initial application graph exceeds 180 KiB gzip (${initialTotal} bytes)`,
  );

const format = (bytes) => `${(bytes / 1024).toFixed(1)} KiB`;
console.log("Web bundle budget (gzip):");
for (const row of rows.slice(0, 12))
  console.log(`  ${row.file}: ${format(row.gzip)} (${format(row.bytes)} raw)`);
console.log(
  `Initial JS gzip total: ${format(initialTotal)} across ${initial.length} files`,
);
console.log(
  `Budgets: ${format(initialLimit)} initial graph; ${format(mainLimit)} for ${main.file}`,
);
