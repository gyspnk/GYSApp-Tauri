import { describe, expect, it } from "vitest";
import { formatVerseNumbers, sortByVerseNumber } from "./verse-selection.js";

describe("formatVerseNumbers", () => {
  it.each([
    [[1], "1"],
    [[1, 2, 3], "1–3"],
    [[1, 2, 3, 5], "1–3, 5"],
    [[3, 1, 2], "1–3"],
    [[1, 3, 5], "1, 3, 5"],
    [[1, 1, 2], "1–2"],
    [[], ""],
  ] as const)("formats %j as %s", (verses, expected) => {
    expect(formatVerseNumbers(verses)).toBe(expected);
  });
});

describe("sortByVerseNumber", () => {
  it("orders a selection the reader clicked backwards", () => {
    expect(
      sortByVerseNumber([{ verse: 5 }, { verse: 3 }, { verse: 12 }]).map(
        (item) => item.verse,
      ),
    ).toEqual([3, 5, 12]);
  });

  it("keeps the input array untouched", () => {
    const input = [{ verse: 2 }, { verse: 1 }];
    sortByVerseNumber(input);
    expect(input.map((item) => item.verse)).toEqual([2, 1]);
  });
});
