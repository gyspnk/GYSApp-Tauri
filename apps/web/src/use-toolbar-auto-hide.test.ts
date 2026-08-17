import { describe, expect, it } from "vitest";
import { computeReadingToolbarVisibility } from "./use-toolbar-auto-hide.js";

describe("computeReadingToolbarVisibility", () => {
  it("keeps toolbar visible at top of page (scrollY <= 40)", () => {
    expect(computeReadingToolbarVisibility(20, 10, true)).toBe(true);
    expect(computeReadingToolbarVisibility(0, 50, false)).toBe(true);
  });

  it("collapses toolbar when scrolling down past top threshold", () => {
    // scroll down with delta > 8 and scrollY > 80
    expect(computeReadingToolbarVisibility(120, 100, true)).toBe(false);
    expect(computeReadingToolbarVisibility(200, 150, true)).toBe(false);
  });

  it("restores toolbar when scrolling up", () => {
    // scroll up with delta < -6
    expect(computeReadingToolbarVisibility(150, 180, false)).toBe(true);
    expect(computeReadingToolbarVisibility(90, 110, false)).toBe(true);
  });

  it("maintains current visibility state when delta is small", () => {
    expect(computeReadingToolbarVisibility(102, 100, true)).toBe(true);
    expect(computeReadingToolbarVisibility(102, 100, false)).toBe(false);
  });
});
