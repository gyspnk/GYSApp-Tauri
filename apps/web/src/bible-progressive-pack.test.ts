import { describe, expect, it, vi } from "vitest";
import { ProgressiveBiblePack } from "./bible-progressive-pack.js";
import type { BibleBookPack } from "./bible-pack-loader.js";

const index = [
  {
    id: "1",
    name: "Kejadian",
    short: "Kej",
    chapters: 50,
    file: "1.json.gz",
    bytes: 79_705,
    verses: 1_533,
  },
  {
    id: "2",
    name: "Keluaran",
    short: "Kel",
    chapters: 40,
    file: "2.json.gz",
    bytes: 60_000,
    verses: 1_213,
  },
  {
    id: "19",
    name: "Mazmur",
    short: "Mzm",
    chapters: 150,
    file: "19.json.gz",
    bytes: 70_000,
    verses: 2_461,
  },
];

function bookPack(id: string, chapters: number[]): BibleBookPack {
  return {
    version: 1,
    translation: "TB",
    book: { id, name: id },
    verses: chapters.flatMap((chapter) => [
      {
        id: `${id}:${chapter}:1`,
        book: id,
        bookOrder: Number(id),
        chapter,
        verse: 1,
        text: `ayat ${id}:${chapter}:1`,
      },
    ]),
    pericopes: [
      {
        id: `${id}${chapters[0]}001`,
        book: id,
        chapter: chapters[0]!,
        verse: 1,
        title: `Judul ${id}`,
      },
    ],
  };
}

describe("ProgressiveBiblePack", () => {
  it("returns nothing until a book arrives", () => {
    const pack = new ProgressiveBiblePack(index, { load: vi.fn() });
    expect(pack.snapshot()).toBeUndefined();
    expect(pack.loadedBooks).toEqual([]);
  });

  it("loads one book at a time and grows the reader pack", async () => {
    const load = vi.fn((id: string) => Promise.resolve(bookPack(id, [1, 2])));
    const pack = new ProgressiveBiblePack(index, { load });

    await pack.ensure("1");
    expect(load).toHaveBeenCalledTimes(1);
    const first = pack.snapshot();
    expect(first?.books.map((book) => book.name)).toEqual(["Kejadian"]);
    expect(first?.verses.map((verse) => verse.id)).toEqual(["1:1:1", "1:2:1"]);
    expect(first?.pericopes?.map((entry) => entry.title)).toEqual(["Judul 1"]);

    await pack.ensure("19");
    const second = pack.snapshot();
    // Canonical index order, not load order.
    expect(second?.books.map((book) => book.id)).toEqual([1, 19]);
    expect(second?.verses).toHaveLength(4);
  });

  it("shares a request when the same book is asked twice", async () => {
    const load = vi.fn((id: string) => Promise.resolve(bookPack(id, [1])));
    const pack = new ProgressiveBiblePack(index, { load });
    await Promise.all([pack.ensure("2"), pack.ensure("2"), pack.ensure("2")]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("keeps chapters from the index and falls back when it is missing", async () => {
    const load = vi.fn((id: string) =>
      Promise.resolve(bookPack(id, [1, 2, 3])),
    );
    const pack = new ProgressiveBiblePack(
      index.filter((entry) => entry.id !== "2"),
      { load },
    );
    await pack.ensure("2");
    const snapshot = pack.snapshot();
    expect(snapshot?.books[0]).toMatchObject({ id: 2, name: "2", chapters: 3 });
  });
});
