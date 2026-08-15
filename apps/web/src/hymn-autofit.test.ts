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
});
