import { describe, expect, it } from "vitest";
import { formatVerseNumbers } from "./verse-selection.js";

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
