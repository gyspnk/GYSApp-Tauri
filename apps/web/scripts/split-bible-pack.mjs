#!/usr/bin/env node
// Splits the bundled reader pack into one gzipped file per book so the reader
// can load only the book it shows. Runs after `vite build` (writes into dist).
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MAGIC_MTIME = 0;

function gzipDeterministic(value) {
  const compressed = gzipSync(Buffer.from(JSON.stringify(value)), { level: 9 });
  compressed.writeUInt32LE(MAGIC_MTIME, 4);
  return compressed;
}

export function splitBiblePack(pack) {
  const books = Array.isArray(pack.books) ? pack.books : [];
  const byBook = new Map(books.map((book) => [String(book.id), []]));
  for (const verse of pack.verses ?? []) {
    const key = String(verse.book);
    if (!byBook.has(key)) byBook.set(key, []);
    byBook.get(key).push(verse);
  }
  const crossRefs = new Map();
  for (const [key, refs] of Object.entries(pack.crossRefs ?? {})) {
    const book = key.split(":")[0];
    if (!crossRefs.has(book)) crossRefs.set(book, {});
    crossRefs.get(book)[key] = refs;
  }
  const pericopes = new Map();
  for (const pericope of pack.pericopes ?? []) {
    const key = String(pericope.book);
    if (!pericopes.has(key)) pericopes.set(key, []);
    pericopes.get(key).push(pericope);
  }

  return [...byBook.entries()]
    .filter(([, verses]) => verses.length > 0)
    .map(([id, verses]) => {
      const book = books.find((entry) => String(entry.id) === id);
      const payload = {
        version: pack.version,
        translation: pack.translation,
        source: pack.source,
        book: book ?? { id, name: id },
        verses,
        pericopes: pericopes.get(id) ?? [],
        // Inline chapter cross-references must arrive with the book itself:
        // when they landed later with the full shelf, the painted verses grew
        // their reference markers after first paint.
        crossRefs: crossRefs.get(id) ?? {},
      };
      return {
        id,
        book: book?.name ?? id,
        short: book?.short ?? id,
        chapters:
          book?.chapters ?? Math.max(...verses.map((verse) => verse.chapter)),
        verses: verses.length,
        gzip: gzipDeterministic(payload),
      };
    });
}

export function writeSplitBiblePack({
  source,
  outDir,
  cacheDir,
  log = console.log,
}) {
  const dir = path.join(outDir, "offline", "bible", "books");
  mkdirSync(dir, { recursive: true });
  const srcStat = statSync(source);
  const cacheKey = `${srcStat.size}:${Math.trunc(srcStat.mtimeMs)}`;
  const keyFile = cacheDir ? path.join(cacheDir, ".cache-key.json") : undefined;

  if (cacheDir && keyFile && existsSync(keyFile)) {
    try {
      const cached = JSON.parse(readFileSync(keyFile, "utf8"));
      if (
        cached.key === cacheKey &&
        existsSync(path.join(cacheDir, "index.json"))
      ) {
        cpSync(cacheDir, dir, { recursive: true, force: true });
        log(
          `[bible] split ${cached.count} books, ${cached.totalKiB} KiB total (cached)`,
        );
        return JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8"))
          .books;
      }
    } catch {
      // Rebuild on corrupt cache.
    }
  }

  const pack = JSON.parse(readFileSync(source, "utf8"));
  const books = splitBiblePack(pack);
  let total = 0;
  const index = [];
  for (const entry of books) {
    const file = `${entry.id}.json.gz`;
    writeFileSync(path.join(dir, file), entry.gzip);
    total += entry.gzip.byteLength;
    index.push({
      id: entry.id,
      name: entry.book,
      short: entry.short,
      chapters: entry.chapters,
      file,
      bytes: entry.gzip.byteLength,
      verses: entry.verses,
    });
  }
  const indexJson = `${JSON.stringify({ books: index }, null, 2)}\n`;
  writeFileSync(path.join(dir, "index.json"), indexJson);
  const totalKiB = (total / 1024).toFixed(0);
  if (cacheDir && keyFile) {
    mkdirSync(cacheDir, { recursive: true });
    cpSync(dir, cacheDir, { recursive: true, force: true });
    writeFileSync(
      keyFile,
      JSON.stringify({ key: cacheKey, count: index.length, totalKiB }),
    );
  }
  log(`[bible] split ${index.length} books, ${totalKiB} KiB total`);
  return index;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  writeSplitBiblePack({
    source: path.resolve("public/offline/bible/tb-reader.json"),
    outDir: path.resolve("dist"),
    cacheDir:
      process.env.GYS_FORCE_BIBLE_PACK === "1"
        ? undefined
        : path.resolve("node_modules/.cache/gys-bible-books"),
  });
}
