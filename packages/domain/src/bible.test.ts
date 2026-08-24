import { describe, expect, it } from "vitest";
import {
  BibleRepository,
  sanitizeBibleText,
  type BibleVerse,
} from "./bible.js";

const verses: BibleVerse[] = [
  {
    id: "gen-1-1",
    book: "Kejadian",
    bookOrder: 1,
    chapter: 1,
    verse: 1,
    text: "Pada mulanya Allah menciptakan langit dan bumi.",
  },
  {
    id: "joh-3-16",
    book: "Yohanes",
    bookOrder: 43,
    chapter: 3,
    verse: 16,
    text: "Karena begitu besar kasih Allah akan dunia ini.",
  },
  {
    id: "joh-3-17",
    book: "Yohanes",
    bookOrder: 43,
    chapter: 3,
    verse: 17,
    text: "Sebab Allah mengutus Anak-Nya ke dalam dunia.",
  },
];

describe("BibleRepository", () => {
  it("returns canonical references and keeps search order stable", async () => {
    const repository = new BibleRepository(verses);
    expect(await repository.getVerse("joh-3-16")).toEqual(verses[1]);
    expect((await repository.search("Allah")).map((verse) => verse.id)).toEqual(
      ["gen-1-1", "joh-3-16", "joh-3-17"],
    );
  });

  it("tracks last-reading and bookmark state without changing the pack", async () => {
    const repository = new BibleRepository(verses);
    await repository.setLastReading({ book: "Yohanes", chapter: 3, verse: 16 });
    await repository.setBookmark("joh-3-16", true);
    expect(repository.lastReading()).toEqual({
      book: "Yohanes",
      chapter: 3,
      verse: 16,
    });
    expect(repository.isBookmarked("joh-3-16")).toBe(true);
    expect(await repository.getVerse("missing")).toBeUndefined();
  });

  it("keeps notes, highlights, history, and reference boundaries typed", async () => {
    const repository = new BibleRepository(verses, {
      pericopes: [
        {
          id: "john-love",
          title: "God's love",
          start: { book: "Yohanes", chapter: 3, verse: 16 },
          end: { book: "Yohanes", chapter: 3, verse: 17 },
        },
      ],
      references: {
        "joh-3-16": [{ book: "Kejadian", chapter: 1, verse: 1 }],
      },
    });
    await repository.setNote("joh-3-16", "Renungkan kasih karunia");
    await repository.setHighlight("joh-3-16", "blue");
    await repository.setLastReading({ book: "Yohanes", chapter: 3 });
    expect(repository.note("joh-3-16")).toContain("kasih");
    expect(repository.highlight("joh-3-16")).toBe("blue");
    expect(repository.history()).toHaveLength(1);
    expect(await repository.getPericope("john-love")).toBeDefined();
    expect(repository.references("joh-3-16")).toEqual([
      { book: "Kejadian", chapter: 1, verse: 1 },
    ]);
  });

  it("supports tokenized, phrase, and whole-word search over sanitized text", async () => {
    const repository = new BibleRepository([
      ...verses,
      {
        id: "joh-3-18",
        book: "Yohanes",
        bookOrder: 43,
        chapter: 3,
        verse: 18,
        text: "<pb/>Karena begitu besar kasih Allah.",
      },
    ]);
    expect(
      (await repository.search("besar Allah")).map((verse) => verse.id),
    ).toEqual(["joh-3-16", "joh-3-18"]);
    expect(
      (await repository.search("begitu besar", { exactPhrase: true })).map(
        (verse) => verse.id,
      ),
    ).toEqual(["joh-3-16", "joh-3-18"]);
    expect(
      (await repository.search("kasih", { wholeWord: true })).map(
        (verse) => verse.id,
      ),
    ).toEqual(["joh-3-16", "joh-3-18"]);
    expect(sanitizeBibleText("<pb/><f>ⓐ</f>Firman &amp; terang")).toBe(
      "Firman & terang",
    );
    expect(
      (await repository.search('"begitu besar" kasih')).map(
        (verse) => verse.id,
      ),
    ).toEqual(["joh-3-16", "joh-3-18"]);
  });

  it("matches numeric-id packs by book name when bookNames are provided", async () => {
    const numericPack: BibleVerse[] = [
      {
        id: "1:1:1",
        book: "1",
        bookOrder: 1,
        chapter: 1,
        verse: 1,
        text: "Pada mulanya Allah menciptakan langit dan bumi.",
      },
      {
        id: "43:3:16",
        book: "43",
        bookOrder: 43,
        chapter: 3,
        verse: 16,
        text: "Karena begitu besar kasih Allah akan dunia ini.",
      },
    ];
    const unnamed = new BibleRepository(numericPack);
    expect(await unnamed.search("Kejadian")).toEqual([]);
    expect(await unnamed.search("Yohanes")).toEqual([]);

    const named = new BibleRepository(numericPack, {
      bookNames: { "1": "Kejadian", "43": "Yohanes" },
    });
    expect((await named.search("Kejadian")).map((verse) => verse.id)).toEqual([
      "1:1:1",
    ]);
    expect((await named.search("Yohanes")).map((verse) => verse.id)).toEqual([
      "43:3:16",
    ]);
    // Text mentions in an earlier book (Matius 3:1 begins "Yohanes
    // Pembaptis") must not outrank the book whose name matches the query.
    const withMention = new BibleRepository(
      [
        ...numericPack,
        {
          id: "40:3:1",
          book: "40",
          bookOrder: 40,
          chapter: 3,
          verse: 1,
          text: "Pada waktu itu tampillah Yohanes Pembaptis di padang gurun.",
        },
      ],
      { bookNames: { "1": "Kejadian", "40": "Matius", "43": "Yohanes" } },
    );
    expect(
      (await withMention.search("Yohanes")).map((verse) => verse.id),
    ).toEqual(["43:3:16", "40:3:1"]);
    // AND terms mix the book name with verse text.
    expect(
      (await named.search("Yohanes kasih")).map((verse) => verse.id),
    ).toEqual(["43:3:16"]);
    // Whole-word name matching stays exact, while plain queries
    // keep substring behavior like the rest of the index.
    expect(
      (await named.search("Yohanes", { wholeWord: true })).map(
        (verse) => verse.id,
      ),
    ).toEqual(["43:3:16"]);
    expect((await named.search("Yohan")).map((verse) => verse.id)).toEqual([
      "43:3:16",
    ]);
    expect(await named.search("Maleakhi")).toEqual([]);
    // Numeric id queries keep working alongside names.
    expect((await named.search("43 kasih")).map((verse) => verse.id)).toEqual([
      "43:3:16",
    ]);
  });

  it("filters by testament using the canonical book order", async () => {
    const repository = new BibleRepository([
      {
        id: "1:1:1",
        book: "1",
        bookOrder: 1,
        chapter: 1,
        verse: 1,
        text: "Pada mulanya Allah menciptakan langit dan bumi.",
      },
      {
        id: "40:3:1",
        book: "40",
        bookOrder: 40,
        chapter: 3,
        verse: 1,
        text: "Pada waktu itu tampillah Yohanes Pembaptis di padang gurun.",
      },
      {
        id: "43:3:16",
        book: "43",
        bookOrder: 43,
        chapter: 3,
        verse: 16,
        text: "Karena begitu besar kasih Allah akan dunia ini.",
      },
    ]);
    expect(
      (await repository.search("Allah", { testament: "old" })).map(
        (verse) => verse.id,
      ),
    ).toEqual(["1:1:1"]);
    expect(
      (await repository.search("Allah", { testament: "new" })).map(
        (verse) => verse.id,
      ),
    ).toEqual(["43:3:16"]);
    // The testament bound excludes every book outside the canon split even
    // when the query term appears in the text.
    expect(
      (await repository.search("Yohanes", { testament: "old" })).map(
        (verse) => verse.id,
      ),
    ).toEqual([]);
    expect(
      (await repository.search("Yohanes", { testament: "new" })).map(
        (verse) => verse.id,
      ),
    ).toEqual(["40:3:1"]);
  });
});
