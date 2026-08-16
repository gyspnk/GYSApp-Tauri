import { describe, expect, it } from "vitest";
import type { BibleReaderPack } from "@gys/contracts";
import {
  bibleBookName,
  bibleVerseEntries,
  bibleVerseHref,
  parseBibleDeepLink,
  resolveBibleDeepLink,
} from "./global-bible-search.js";

const PACK: BibleReaderPack = {
  version: 1,
  translation: "TB",
  source: "test",
  books: [
    { id: 1, short: "Kej", name: "Kejadian", chapters: 50 },
    { id: 43, short: "Yoh", name: "Yohanes", chapters: 21 },
  ],
  verses: [
    {
      id: "1:1:1",
      book: "1",
      bookOrder: 1,
      chapter: 1,
      verse: 1,
      text: "<pb/>Pada mulanya Allah menciptakan langit dan bumi.",
    },
    {
      id: "43:3:16",
      book: "43",
      bookOrder: 43,
      chapter: 3,
      verse: 16,
      text: "Karena begitu besar kasih Allah akan dunia ini, sehingga Ia telah mengaruniakan Anak-Nya yang tunggal.",
    },
    {
      id: "43:3:17",
      book: "43",
      bookOrder: 43,
      chapter: 3,
      verse: 17,
      text: "Sebab Allah mengutus Anak-Nya ke dalam dunia bukan untuk menghakimi dunia.",
    },
  ],
};

function verseByIndex(index: number) {
  const verse = PACK.verses[index];
  if (!verse) throw new Error(`Missing test verse ${index}`);
  return verse;
}

describe("bibleBookName", () => {
  it("resolves numeric TB book ids to display names", () => {
    expect(bibleBookName(PACK, "43")).toBe("Yohanes");
    expect(bibleBookName(PACK, 1)).toBe("Kejadian");
  });
  it("falls back to the raw id for unknown books", () => {
    expect(bibleBookName(PACK, "99")).toBe("99");
  });
});

describe("bibleVerseEntries", () => {
  it("builds compact search entries with sanitized snippets", () => {
    const entries = bibleVerseEntries(PACK, [verseByIndex(1)]);
    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry).toBeDefined();
    expect(entry?.kind).toBe("bible");
    expect(entry?.title).toBe("Yohanes 3:16");
    expect(entry?.detail).toBe(
      "Karena begitu besar kasih Allah akan dunia ini, sehingga Ia telah mengaruniakan Anak-Nya yang tunggal.",
    );
    expect(entry?.searchText).toContain("Yohanes 3:16");
    expect(entry?.href).toBe("/bible?book=43&chapter=3&verse=16");
    expect(entry?.id).toBe("bible-43:3:16");
  });
  it("strips markup tokens from the snippet", () => {
    const entries = bibleVerseEntries(PACK, [verseByIndex(0)]);
    expect(entries[0]?.detail.startsWith("<pb/>")).toBe(false);
    expect(entries[0]?.detail).toContain("Pada mulanya");
  });
  it("caps the entry count", () => {
    const entries = bibleVerseEntries(PACK, [
      verseByIndex(0),
      verseByIndex(1),
      verseByIndex(2),
      verseByIndex(0),
      verseByIndex(1),
      verseByIndex(2),
      verseByIndex(0),
    ]);
    expect(entries.length).toBeLessThanOrEqual(6);
  });
});

describe("bibleVerseHref", () => {
  it("keeps the reader inside the application shell", () => {
    expect(bibleVerseHref(verseByIndex(0))).toBe(
      "/bible?book=1&chapter=1&verse=1",
    );
  });
});

describe("parseBibleDeepLink", () => {
  it("accepts a complete book/chapter/verse link", () => {
    expect(
      parseBibleDeepLink(new URLSearchParams("book=43&chapter=3&verse=16")),
    ).toEqual({ book: "43", chapter: 3, verse: 16 });
  });
  it("rejects missing or non-integer parts", () => {
    expect(parseBibleDeepLink(new URLSearchParams("book=43"))).toBeUndefined();
    expect(
      parseBibleDeepLink(new URLSearchParams("book=43&chapter=3")),
    ).toBeUndefined();
    expect(
      parseBibleDeepLink(new URLSearchParams("book=43&chapter=x&verse=16")),
    ).toBeUndefined();
    expect(
      parseBibleDeepLink(new URLSearchParams("book=&chapter=3&verse=16")),
    ).toBeUndefined();
    expect(parseBibleDeepLink(undefined)).toBeUndefined();
  });
});

describe("resolveBibleDeepLink", () => {
  it("clamps an oversized verse number to the last verse of the chapter", () => {
    expect(
      resolveBibleDeepLink(PACK, { book: "43", chapter: 3, verse: 999 }),
    ).toEqual({ bookId: 43, chapter: 3, verse: 17 });
  });
  it("returns undefined for a chapter beyond the book bounds", () => {
    expect(
      resolveBibleDeepLink(PACK, { book: "43", chapter: 99, verse: 1 }),
    ).toBeUndefined();
  });
  it("returns undefined for an unknown book", () => {
    expect(
      resolveBibleDeepLink(PACK, { book: "99", chapter: 1, verse: 1 }),
    ).toBeUndefined();
  });
  it("returns undefined for a chapter without verses", () => {
    expect(
      resolveBibleDeepLink(PACK, { book: "43", chapter: 21, verse: 1 }),
    ).toBeUndefined();
  });
});
