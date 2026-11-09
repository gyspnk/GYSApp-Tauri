import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { splitBiblePack, writeSplitBiblePack } from "./split-bible-pack.mjs";

const pack = {
  version: "1",
  translation: "TB",
  source: "fixture",
  books: [
    { id: "1", short: "Kej", name: "Kejadian", chapters: 2 },
    { id: "2", short: "Kel", name: "Keluaran", chapters: 1 },
  ],
  verses: [
    { id: "1:1:1", book: "1", chapter: 1, verse: 1, text: "Pada mulanya" },
    {
      id: "1:1:2",
      book: "1",
      chapter: 1,
      verse: 2,
      text: "Bumi belum berbentuk",
    },
    { id: "2:1:1", book: "2", chapter: 1, verse: 1, text: "Inilah nama-nama" },
  ],
  pericopes: [
    { id: "1001001", book: "1", chapter: 1, verse: 1, title: "Penciptaan" },
  ],
  crossRefs: {
    "1:1:1": [{ book: "43", chapter: 1, verse: 1 }],
    "2:1:1": [{ book: "40", chapter: 5, verse: 8 }],
  },
};

test("split sends each book its own cross references", () => {
  const books = splitBiblePack(pack);
  const refsOf = (id) =>
    JSON.parse(gunzipSync(books.find((entry) => entry.id === id).gzip))
      .crossRefs;

  assert.deepEqual(refsOf("1"), {
    "1:1:1": [{ book: "43", chapter: 1, verse: 1 }],
  });
  assert.deepEqual(refsOf("2"), {
    "2:1:1": [{ book: "40", chapter: 5, verse: 8 }],
  });
});

test("split groups verses and pericopes per book", () => {
  const books = splitBiblePack(pack);
  assert.equal(books.length, 2);
  const genesis = books.find((entry) => entry.id === "1");
  const exodus = books.find((entry) => entry.id === "2");
  assert.equal(genesis.verses, 2);
  assert.equal(exodus.verses, 1);
  assert.ok(genesis.gzip[0] === 0x1f && genesis.gzip[1] === 0x8b, "gzip magic");
});

test("split output is byte-identical across runs", () => {
  const first = splitBiblePack(pack);
  const second = splitBiblePack(pack);
  assert.deepEqual(
    first.map((entry) => entry.gzip),
    second.map((entry) => entry.gzip),
  );
});

test("writeSplitBiblePack emits one file per book plus an index", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "bible-split-"));
  try {
    const source = path.join(dir, "pack.json");
    writeFileSync(source, JSON.stringify(pack));
    const index = writeSplitBiblePack({ source, outDir: dir, log: () => {} });
    assert.deepEqual(
      index.map((entry) => entry.name),
      ["Kejadian", "Keluaran"],
    );
    const file = readFileSync(
      path.join(dir, "offline", "bible", "books", "1.json.gz"),
    );
    assert.ok(file[0] === 0x1f && file[1] === 0x8b);
    const manifest = JSON.parse(
      readFileSync(
        path.join(dir, "offline", "bible", "books", "index.json"),
        "utf8",
      ),
    );
    assert.equal(manifest.books.length, 2);
    assert.equal(manifest.books[0].bytes, file.byteLength);
    // The reader needs the shelf metadata before it downloads a single book.
    assert.equal(manifest.books[0].short, "Kej");
    assert.equal(manifest.books[0].chapters, 2);
    assert.equal(manifest.books[1].short, "Kel");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
