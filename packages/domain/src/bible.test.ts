import { describe, expect, it } from "vitest";
import { BibleRepository, type BibleVerse } from "./bible.js";

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
});
