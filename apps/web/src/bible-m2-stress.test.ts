import { describe, expect, it } from "vitest";
import {
  resolveDragColumn,
  scrubBookIndex,
  scrubChapterNumber,
  scrubVerseNumber,
} from "./bible-quick-nav.js";
import {
  calculateProportionalScroll,
  calculateVerseAnchorScroll,
  clampSplitRatio,
  splitRatioFromPointer,
  adjustSplitRatio,
  readStoredSplitRatio,
  readStoredSyncScroll,
} from "./bible-split.js";

describe("Milestone 2 Stress Tests: bible-quick-nav pure math & edge cases", () => {
  describe("resolveDragColumn", () => {
    it("handles extreme negative coordinates and non-standard container widths", () => {
      expect(resolveDragColumn(-500, 800)).toBe("book");
      expect(resolveDragColumn(-0.0001, 800)).toBe("book");
      expect(resolveDragColumn(-Infinity, 800)).toBe("chapter");
      expect(resolveDragColumn(Number.NEGATIVE_INFINITY, 800)).toBe("chapter");
    });

    it("handles extreme positive floats and huge numbers", () => {
      expect(resolveDragColumn(1e12, 800)).toBe("verse");
      expect(resolveDragColumn(999999, 1000)).toBe("verse");
      expect(resolveDragColumn(Infinity, 800)).toBe("chapter");
      expect(resolveDragColumn(Number.NaN, 800)).toBe("chapter");
    });

    it("handles invalid or non-positive container widths gracefully", () => {
      expect(resolveDragColumn(100, 0)).toBe("chapter");
      expect(resolveDragColumn(100, -100)).toBe("chapter");
      expect(resolveDragColumn(100, -Infinity)).toBe("chapter");
      expect(resolveDragColumn(100, Number.NaN)).toBe("chapter");
    });

    it("accurately handles exact boundary ratios", () => {
      expect(resolveDragColumn(0, 1000)).toBe("book");
      expect(resolveDragColumn(339, 1000)).toBe("book");
      expect(resolveDragColumn(340, 1000)).toBe("chapter");
      expect(resolveDragColumn(500, 1000)).toBe("chapter");
      expect(resolveDragColumn(660, 1000)).toBe("chapter");
      expect(resolveDragColumn(661, 1000)).toBe("verse");
      expect(resolveDragColumn(1000, 1000)).toBe("verse");
    });
  });

  describe("scrubBookIndex", () => {
    it("handles negative start indices and clamps to [0, totalBooks - 1]", () => {
      expect(scrubBookIndex(-10, 0, 66, 24)).toBe(0);
      expect(scrubBookIndex(-5, -100, 66, 24)).toBe(0);
    });

    it("handles out-of-bounds start indices above totalBooks", () => {
      expect(scrubBookIndex(100, 0, 66, 24)).toBe(65);
      expect(scrubBookIndex(999, 1000, 66, 24)).toBe(65);
      expect(scrubBookIndex(999, 50000, 66, 24)).toBe(0);
    });

    it("handles extreme float deltaY and step sizes", () => {
      expect(scrubBookIndex(30, -1e6, 66, 24)).toBe(65);
      expect(scrubBookIndex(30, 1e6, 66, 24)).toBe(0);
      expect(scrubBookIndex(30, -0.001, 66, 24)).toBe(30);
      expect(scrubBookIndex(30, 0.001, 66, 24)).toBe(30);
    });

    it("handles zero and negative totalBooks or stepPixels", () => {
      expect(scrubBookIndex(10, -50, 0, 24)).toBe(0);
      expect(scrubBookIndex(10, -50, -5, 24)).toBe(0);
      expect(scrubBookIndex(10, -50, 66, 0)).toBe(60);
      expect(scrubBookIndex(10, -50, 66, -10)).toBe(60);
    });
  });

  describe("scrubChapterNumber", () => {
    it("handles startChapter at boundaries and beyond", () => {
      expect(scrubChapterNumber(-5, 0, 28, 48)).toBe(1);
      expect(scrubChapterNumber(0, 0, 28, 48)).toBe(1);
      expect(scrubChapterNumber(50, 0, 28, 48)).toBe(28);
    });

    it("verifies exact smoke test 48px/96px contracts", () => {
      expect(scrubChapterNumber(1, -48, 50, 48)).toBe(2);
      expect(scrubChapterNumber(3, -96, 21, 48)).toBe(5);
      expect(scrubChapterNumber(5, 96, 21, 48)).toBe(3);
    });

    it("handles zero and negative totalChapters or stepPixels", () => {
      expect(scrubChapterNumber(5, -100, 0, 48)).toBe(1);
      expect(scrubChapterNumber(5, -100, -10, 48)).toBe(1);
      expect(scrubChapterNumber(1, -10, 50, 0)).toBe(11);
    });

    it("handles single-chapter books (e.g. Obaja, Filemon, 2 Yohanes, 3 Yohanes, Yudas)", () => {
      expect(scrubChapterNumber(1, -100, 1, 48)).toBe(1);
      expect(scrubChapterNumber(1, 100, 1, 48)).toBe(1);
    });

    it("handles longest books (e.g. Mazmur with 150 chapters)", () => {
      expect(scrubChapterNumber(1, -150 * 48, 150, 48)).toBe(150);
      expect(scrubChapterNumber(150, 150 * 48, 150, 48)).toBe(1);
    });
  });

  describe("scrubVerseNumber", () => {
    it("handles boundaries and out-of-bounds startVerse", () => {
      expect(scrubVerseNumber(-10, 0, 36, 28)).toBe(1);
      expect(scrubVerseNumber(100, 0, 36, 28)).toBe(36);
    });

    it("handles longest chapter verses (e.g. Mazmur 119 with 176 verses)", () => {
      expect(scrubVerseNumber(1, -176 * 28, 176, 28)).toBe(176);
      expect(scrubVerseNumber(176, 176 * 28, 176, 28)).toBe(1);
      expect(scrubVerseNumber(1, -10 * 28, 176, 28)).toBe(11);
    });

    it("handles shortest chapters (e.g. Mazmur 117 with 2 verses)", () => {
      expect(scrubVerseNumber(1, -28, 2, 28)).toBe(2);
      expect(scrubVerseNumber(2, 28, 2, 28)).toBe(1);
    });

    it("handles zero and negative totalVerses", () => {
      expect(scrubVerseNumber(5, -50, 0, 28)).toBe(1);
      expect(scrubVerseNumber(5, -50, -10, 28)).toBe(1);
    });
  });

  describe("Tap vs Drag Threshold Discrimination", () => {
    const checkDragThreshold = (dx: number, dy: number, threshold = 6) =>
      Math.abs(dx) > threshold || Math.abs(dy) > threshold;

    it("discriminates micro-movements (tap) from intentional dragging", () => {
      expect(checkDragThreshold(0, 0)).toBe(false);
      expect(checkDragThreshold(2, 3)).toBe(false);
      expect(checkDragThreshold(-4, 2)).toBe(false);
      expect(checkDragThreshold(5, 0)).toBe(false);
      expect(checkDragThreshold(0, -5)).toBe(false);

      expect(checkDragThreshold(7, 0)).toBe(true);
      expect(checkDragThreshold(0, -7)).toBe(true);
      expect(checkDragThreshold(15, 20)).toBe(true);
      expect(checkDragThreshold(-96, 0)).toBe(true);
    });
  });
});

describe("Milestone 2 Stress Tests: calculateProportionalScroll & calculateVerseAnchorScroll", () => {
  describe("calculateProportionalScroll", () => {
    it("handles zero clientHeight gracefully", () => {
      expect(calculateProportionalScroll(500, 1000, 0, 2000, 0)).toBe(1000);
      expect(calculateProportionalScroll(250, 500, 0, 1000, 0)).toBe(500);
    });

    it("handles zero or negative scrollable area (scrollHeight <= clientHeight)", () => {
      expect(calculateProportionalScroll(0, 500, 500, 1000, 400)).toBe(0);
      expect(calculateProportionalScroll(100, 300, 500, 1000, 400)).toBe(0);
      expect(calculateProportionalScroll(100, 1000, 400, 300, 500)).toBe(0);
    });

    it("handles massive scrollHeights without precision loss or overflow", () => {
      const sourceScrollHeight = 50_000_000;
      const sourceClientHeight = 1_000;
      const targetScrollHeight = 100_000_000;
      const targetClientHeight = 1_000;

      const midSource = (sourceScrollHeight - sourceClientHeight) / 2;
      const expectedTarget = Math.round(
        (targetScrollHeight - targetClientHeight) / 2,
      );
      expect(
        calculateProportionalScroll(
          midSource,
          sourceScrollHeight,
          sourceClientHeight,
          targetScrollHeight,
          targetClientHeight,
        ),
      ).toBe(expectedTarget);
    });

    it("handles negative scroll positions (e.g. mobile overscroll / rubber-banding)", () => {
      expect(calculateProportionalScroll(-150, 1000, 400, 800, 400)).toBe(0);
    });

    it("handles over-scrolled positions (sourceScrollTop > maxSource)", () => {
      expect(calculateProportionalScroll(800, 1000, 400, 800, 400)).toBe(400);
      expect(calculateProportionalScroll(99999, 1000, 400, 800, 400)).toBe(400);
    });

    it("handles asymmetric chapter sizes (e.g. Mazmur 119 vs Mazmur 117)", () => {
      const m119ScrollHeight = 12000;
      const m117ScrollHeight = 800;
      const clientHeight = 600;

      expect(
        calculateProportionalScroll(
          0,
          m119ScrollHeight,
          clientHeight,
          m117ScrollHeight,
          clientHeight,
        ),
      ).toBe(0);

      expect(
        calculateProportionalScroll(
          5700,
          m119ScrollHeight,
          clientHeight,
          m117ScrollHeight,
          clientHeight,
        ),
      ).toBe(100);

      expect(
        calculateProportionalScroll(
          11400,
          m119ScrollHeight,
          clientHeight,
          m117ScrollHeight,
          clientHeight,
        ),
      ).toBe(200);

      expect(
        calculateProportionalScroll(
          100,
          m117ScrollHeight,
          clientHeight,
          m119ScrollHeight,
          clientHeight,
        ),
      ).toBe(5700);
    });
  });

  describe("calculateVerseAnchorScroll", () => {
    it("handles extreme verse count ratios (Mazmur 119: 176 verses vs Mazmur 117: 2 verses)", () => {
      expect(calculateVerseAnchorScroll(1, 176, 2)).toBe(1);
      expect(calculateVerseAnchorScroll(176, 176, 2)).toBe(2);
      expect(calculateVerseAnchorScroll(88, 176, 2)).toBe(1);
      expect(calculateVerseAnchorScroll(89, 176, 2)).toBe(2);

      expect(calculateVerseAnchorScroll(1, 2, 176)).toBe(1);
      expect(calculateVerseAnchorScroll(2, 2, 176)).toBe(176);
    });

    it("handles 1:1 verse count identical chapters", () => {
      for (let v = 1; v <= 20; v++) {
        expect(calculateVerseAnchorScroll(v, 20, 20)).toBe(v);
      }
    });

    it("handles single-verse target or source chapters", () => {
      expect(calculateVerseAnchorScroll(1, 1, 1)).toBe(1);
      expect(calculateVerseAnchorScroll(1, 1, 50)).toBe(1);
      expect(calculateVerseAnchorScroll(25, 50, 1)).toBe(1);
    });

    it("handles out-of-range primary verse indices (negative or > totalVerses)", () => {
      expect(calculateVerseAnchorScroll(-5, 50, 30)).toBe(1);
      expect(calculateVerseAnchorScroll(100, 50, 30)).toBe(30);
    });

    it("handles zero or negative totalVerses", () => {
      expect(calculateVerseAnchorScroll(5, 0, 30)).toBe(1);
      expect(calculateVerseAnchorScroll(5, 30, 0)).toBe(1);
      expect(calculateVerseAnchorScroll(5, -10, -20)).toBe(1);
    });
  });
});

describe("Milestone 2 Stress Tests: split ratio & storage resilience", () => {
  it("clampSplitRatio handles NaN, Infinity, -Infinity, strings, extreme ranges safely", () => {
    expect(clampSplitRatio(Number.NaN)).toBe(50);
    expect(clampSplitRatio(Infinity)).toBe(50);
    expect(clampSplitRatio(-Infinity)).toBe(50);
    expect(clampSplitRatio(0)).toBe(20);
    expect(clampSplitRatio(100)).toBe(80);
    expect(clampSplitRatio(50.4)).toBe(50);
    expect(clampSplitRatio(50.6)).toBe(51);
  });

  it("splitRatioFromPointer handles rect width 0 and negative coordinates", () => {
    expect(
      splitRatioFromPointer(100, 0, { left: 0, width: 0, top: 0, height: 0 }),
    ).toBe(50);
    expect(
      splitRatioFromPointer(100, 0, {
        left: 0,
        width: -100,
        top: 0,
        height: 0,
      }),
    ).toBe(50);
    expect(
      splitRatioFromPointer(-500, 0, {
        left: 0,
        width: 1000,
        top: 0,
        height: 0,
      }),
    ).toBe(20);
    expect(
      splitRatioFromPointer(5000, 0, {
        left: 0,
        width: 1000,
        top: 0,
        height: 0,
      }),
    ).toBe(80);
  });

  it("adjustSplitRatio handles non-finite delta", () => {
    expect(adjustSplitRatio(50, Number.NaN)).toBe(50);
    expect(adjustSplitRatio(50, Infinity)).toBe(50);
    expect(adjustSplitRatio(50, -Infinity)).toBe(50);
  });

  it("readStoredSplitRatio handles malformed storage values", () => {
    expect(readStoredSplitRatio({ getItem: () => "invalid" })).toBe(50);
    expect(readStoredSplitRatio({ getItem: () => "" })).toBe(20);
    expect(readStoredSplitRatio({ getItem: () => "999" })).toBe(80);
    expect(readStoredSplitRatio({ getItem: () => "-50" })).toBe(20);
  });

  it("readStoredSyncScroll handles missing or corrupt values", () => {
    expect(readStoredSyncScroll({ getItem: () => "garbage" }, true)).toBe(
      false,
    );
    expect(readStoredSyncScroll({ getItem: () => "1" })).toBe(true);
    expect(readStoredSyncScroll({ getItem: () => "true" })).toBe(true);
    expect(readStoredSyncScroll({ getItem: () => "0" })).toBe(false);
    expect(readStoredSyncScroll({ getItem: () => "false" })).toBe(false);
    expect(readStoredSyncScroll({ getItem: () => null }, true)).toBe(true);
    expect(readStoredSyncScroll({ getItem: () => null }, false)).toBe(false);
  });
});
