import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const output = resolve(
  root,
  "apps/web/public/offline/distributed-hymn-catalog.json",
);
const sourceRepo = "ThenGB/GYSAPP-Fork";
const sourceCommit = "4f0d39b";
const sourceBase = `https://raw.githubusercontent.com/${sourceRepo}/${sourceCommit}/assets/data`;

const books = [
  {
    code: "HYMNE",
    file: "hymne_index.json",
    book: "english",
    folder: "hymne",
    title: "Hymne (English Version)",
  },
  {
    code: "MDR",
    file: "mdr_index.json",
    book: "mandarin",
    folder: "mdr",
    title: "Mandarin",
  },
  {
    code: "ASM-I",
    file: "asm_i_index.json",
    book: "anak",
    folder: "asm_i",
    title: "Aku Senang Menyanyi I",
  },
  {
    code: "ASM-M",
    file: "asm_m_index.json",
    book: "anak",
    folder: "asm_m",
    title: "Aku Senang Menyanyi M",
  },
  {
    code: "ASM-P",
    file: "asm_p_index.json",
    book: "anak",
    folder: "asm_p",
    title: "Aku Senang Menyanyi P",
  },
];

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!response.ok)
    throw new Error(`Fork hymn index failed: ${url} (${response.status})`);
  return JSON.parse((await response.text()).replace(/^\uFEFF/, ""));
}

function normalizeSong(book, song) {
  const number = Number.parseInt(String(song.number), 10);
  if (
    !Number.isInteger(number) ||
    number <= 0 ||
    !song.title ||
    !Array.isArray(song.verses) ||
    song.verses.length === 0
  ) {
    throw new Error(`Invalid ${book.code} hymn ${JSON.stringify(song)}`);
  }
  const verses = song.verses
    .map((verse) => String(verse).trim())
    .filter(Boolean);
  if (!verses.length) throw new Error(`Empty ${book.code} hymn ${song.number}`);
  const pdfPath = `assets/data/${song.pdfFile}`;
  const midiPath = song.midiFile
    ? `assets/midi/${song.midiFile.replace(/^midi\//, "")}`
    : `assets/data/midi/${book.folder}/${String(song.number).padStart(3, "0")}.mid`;
  return {
    id: `${book.code.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${String(number).padStart(3, "0")}`,
    assetCode: book.code,
    book: book.book,
    number,
    title: String(song.title).trim(),
    verses,
    lyrics: verses.join("\n\n"),
    midiPath,
    pdfPath,
    ...(Number.isInteger(song.page) && song.page > 0
      ? { pdfPage: song.page }
      : {}),
    ...(Number.isInteger(song.pages) && song.pages > 0
      ? { pdfPages: song.pages }
      : {}),
  };
}

const catalogs = await Promise.all(
  books.map(async (book) => {
    const songs = await fetchJson(`${sourceBase}/index/${book.file}`);
    if (!Array.isArray(songs)) throw new Error(`Unexpected ${book.file} shape`);
    return {
      code: book.code,
      title: book.title,
      items: songs.map((song) => normalizeSong(book, song)),
    };
  }),
);

const generatedAt = new Date().toISOString();
const catalog = { version: 1, sourceRepo, sourceCommit, generatedAt, catalogs };
await mkdir(dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");
console.log(
  `Generated ${catalogs.reduce((count, item) => count + item.items.length, 0)} distributed hymn entries: ${output}`,
);
