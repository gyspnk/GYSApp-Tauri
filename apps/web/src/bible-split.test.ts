import { describe, expect, it } from "vitest";
import {
  adjustSplitRatio,
  calculateProportionalScroll,
  calculateVerseAnchorScroll,
  clampSplitRatio,
  readStoredSplitRatio,
  readStoredSyncScroll,
  splitRatioFromPointer,
} from "./bible-split.js";

describe("Bible split controller geometry & sync scrolling", () => {
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

  it("reads stored sync-scroll preference correctly", () => {
    expect(readStoredSyncScroll(undefined)).toBe(true);
    expect(readStoredSyncScroll({ getItem: () => null })).toBe(true);
    expect(readStoredSyncScroll({ getItem: () => "0" })).toBe(false);
    expect(readStoredSyncScroll({ getItem: () => "false" })).toBe(false);
    expect(readStoredSyncScroll({ getItem: () => "1" })).toBe(true);
    expect(readStoredSyncScroll({ getItem: () => "true" })).toBe(true);
  });

  it("calculates proportional scroll smoothly between different pane dimensions", () => {
    // 50% scroll of source (300 / 600) -> 50% scroll of target (200 / 400)
    expect(calculateProportionalScroll(300, 1000, 400, 800, 400)).toBe(200);
    // Top of source -> Top of target
    expect(calculateProportionalScroll(0, 1000, 400, 800, 400)).toBe(0);
    // Bottom of source -> Bottom of target
    expect(calculateProportionalScroll(600, 1000, 400, 800, 400)).toBe(400);
    // Zero scrollable area
    expect(calculateProportionalScroll(50, 400, 400, 400, 400)).toBe(0);
  });

  it("maps proportional verse anchors between chapters with different verse counts", () => {
    // Mazmur 119 (176 verses) to Mazmur 117 (2 verses)
    expect(calculateVerseAnchorScroll(1, 176, 2)).toBe(1);
    expect(calculateVerseAnchorScroll(176, 176, 2)).toBe(2);
    expect(calculateVerseAnchorScroll(88, 176, 2)).toBe(1);
    expect(calculateVerseAnchorScroll(89, 176, 2)).toBe(2);

    // Yohanes 3 (36 verses) to Yohanes 4 (54 verses)
    expect(calculateVerseAnchorScroll(1, 36, 54)).toBe(1);
    expect(calculateVerseAnchorScroll(36, 36, 54)).toBe(54);
    expect(calculateVerseAnchorScroll(18, 36, 54)).toBe(27);
  });
});
