import { describe, expect, it } from "vitest";
import { autoFitFontSize, MIN_AUTOFIT_FONT_SIZE } from "./hymn-autofit.js";

describe("hymn text auto-fit", () => {
  it("keeps the preferred size when the measured line fits", () => {
    expect(
      autoFitFontSize({
        preferredFontSize: 20,
        availableWidth: 360,
        measuredWidth: 340,
      }),
    ).toBe(20);
  });

  it("shrinks overflow without exceeding the preferred size", () => {
    expect(
      autoFitFontSize({
        preferredFontSize: 24,
        availableWidth: 300,
        measuredWidth: 480,
      }),
    ).toBe(15);
  });

  it("never shrinks below the readable floor", () => {
    expect(
      autoFitFontSize({
        preferredFontSize: 18,
        availableWidth: 100,
        measuredWidth: 900,
      }),
    ).toBe(MIN_AUTOFIT_FONT_SIZE);
  });

  it("keeps hysteresis local to the reader that supplied its previous size", () => {
    const input = {
      preferredFontSize: 20,
      availableWidth: 340,
      measuredWidth: 400,
    };
    expect(autoFitFontSize({ ...input, lastFittedFontSize: 16.5 })).toBe(16.5);
    expect(autoFitFontSize(input)).toBe(17);
    expect(autoFitFontSize({ ...input, lastFittedFontSize: 16.5 })).toBe(16.5);
  });

  it("fits a tall verse even when its lines already fit the width", () => {
    expect(
      autoFitFontSize({
        preferredFontSize: 40,
        availableWidth: 360,
        measuredWidth: 300,
        availableHeight: 400,
        measuredHeight: 800,
      }),
    ).toBe(20);
  });
});
