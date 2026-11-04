// GitHub Pages serves `offline/bible/tb-reader.json` without content-encoding:
// 7,6 MB of JSON for every first visit. A pre-compressed sibling cuts that to
// ~1,7 MB and the client inflates it with DecompressionStream. The gzip header
// carries mtime 0 so rebuilds stay byte-identical.
import { gzipSync } from "node:zlib";
import { readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const PACK = join("public", "offline", "bible", "tb-reader.json");
const OUT = `${PACK}.gz`;

const bytes = await readFile(PACK);
const compressed = gzipSync(bytes, { level: 9 });
compressed.writeUInt32LE(0, 4); // deterministic mtime
await writeFile(OUT, compressed);
const source = await stat(PACK);
const target = await stat(OUT);
console.log(
  `bible pack: ${(source.size / 1024 / 1024).toFixed(1)} MB -> ${(target.size / 1024 / 1024).toFixed(2)} MB gzip`,
);
