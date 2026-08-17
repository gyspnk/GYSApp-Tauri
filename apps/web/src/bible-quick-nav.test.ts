import { describe, expect, it } from "vitest";
import {
  resolveDragColumn,
  scrubBookIndex,
  scrubChapterNumber,
  scrubVerseNumber,
} from "./bible-quick-nav.js";

describe("Bible quick navigation scrubbing math & column resolution", () => {
  it("resolves drag column from horizontal pointer position", () => {
    // 800px width container
    expect(resolveDragColumn(100, 800)).toBe("book"); // 12.5% -> book
    expect(resolveDragColumn(400, 800)).toBe("chapter"); // 50% -> chapter
    expect(resolveDragColumn(700, 800)).toBe("verse"); // 87.5% -> verse

    // Fallbacks
    expect(resolveDragColumn(Number.NaN, 800)).toBe("chapter");
    expect(resolveDragColumn(100, 0)).toBe("chapter");
  });

  it("scrubs book index with boundary clamping", () => {
    // 66 books (0..65)
    // Moving up 48px from book 42 (Yohanes is 43rd book, index 42) -> +2 books = index 44 (Kisah Para Rasul is 44th, index 43, Roma is 45th, index 44)
    expect(scrubBookIndex(42, -48, 66, 24)).toBe(44);
    // Moving down 48px from book 42 -> -2 books = index 40
    expect(scrubBookIndex(42, 48, 66, 24)).toBe(40);
    // Clamping to lower bound (0)
    expect(scrubBookIndex(2, 200, 66, 24)).toBe(0);
    // Clamping to upper bound (65)
    expect(scrubBookIndex(64, -200, 66, 24)).toBe(65);
  });

  it("scrubs chapter number matching the smoke test 48px step contract", () => {
    // Yohanes has 21 chapters. Start at chapter 3.
    // Moving up 96px (deltaY = -96) -> 3 + 2 = chapter 5
    expect(scrubChapterNumber(3, -96, 21, 48)).toBe(5);
    // Moving down 48px -> chapter 2
    expect(scrubChapterNumber(3, 48, 21, 48)).toBe(2);
    // Clamping to minimum (chapter 1)
    expect(scrubChapterNumber(3, 200, 21, 48)).toBe(1);
    // Clamping to maximum (chapter 21)
    expect(scrubChapterNumber(20, -100, 21, 48)).toBe(21);
  });

  it("scrubs verse number with boundary clamping", () => {
    // Yohanes 3 has 36 verses. Start at verse 16.
    // Moving up 56px (deltaY = -56) with 28px step -> 16 + 2 = verse 18
    expect(scrubVerseNumber(16, -56, 36, 28)).toBe(18);
    // Moving down 28px -> verse 15
    expect(scrubVerseNumber(16, 28, 36, 28)).toBe(15);
    // Clamping to 1
    expect(scrubVerseNumber(5, 200, 36, 28)).toBe(1);
    // Clamping to total verses (36)
    expect(scrubVerseNumber(34, -200, 36, 28)).toBe(36);
  });
});
