import { describe, expect, it } from "vitest";
import {
  adjustSplitRatio,
  clampSplitRatio,
  readStoredSplitRatio,
  splitRatioFromPointer,
} from "./bible-split.js";

describe("Bible split controller geometry", () => {
  it("keeps the ratio inside the readable pane bounds", () => {
    expect(clampSplitRatio(20)).toBe(42);
    expect(clampSplitRatio(58)).toBe(58);
    expect(clampSplitRatio(90)).toBe(72);
    expect(clampSplitRatio(Number.NaN)).toBe(58);
  });

  it("maps pointer movement to a bounded percentage", () => {
    const rect = { left: 100, width: 800 } as DOMRect;
    expect(splitRatioFromPointer(100, rect)).toBe(42);
    expect(splitRatioFromPointer(564, rect)).toBe(58);
    expect(splitRatioFromPointer(900, rect)).toBe(72);
  });

  it("supports keyboard-friendly ratio adjustments", () => {
    expect(adjustSplitRatio(58, -2)).toBe(56);
    expect(adjustSplitRatio(42, -2)).toBe(42);
    expect(adjustSplitRatio(72, 2)).toBe(72);
  });

  it("uses the default when a storage key is missing instead of treating null as zero", () => {
    expect(readStoredSplitRatio({ getItem: () => null })).toBe(58);
    expect(readStoredSplitRatio({ getItem: () => "64" })).toBe(64);
  });
});
