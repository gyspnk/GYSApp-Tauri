import { describe, expect, it } from "vitest";
import {
  clampPdfZoomPercent,
  isPdfLayout,
  nextPdfPage,
  pdfLayoutForViewport,
  pdfPercentScale,
  pdfRasterScale,
  pdfFitScale,
} from "./pdf-utils.js";

describe("PDF reader layout policy", () => {
  it("keeps two-page reading out of compact viewports", () => {
    expect(pdfLayoutForViewport("two", 390)).toBe("single");
    expect(pdfLayoutForViewport("two", 768)).toBe("two");
    expect(pdfLayoutForViewport("horizontal", 390)).toBe("horizontal");
  });

  it("recognizes only persisted layout values and clamps page navigation", () => {
    expect(isPdfLayout("horizontal")).toBe(true);
    expect(isPdfLayout("spread")).toBe(false);
    expect(nextPdfPage(99, 4, 1)).toBe(4);
  });
});

describe("PDF percent zoom (gyschordweb page-fit parity)", () => {
  it("clamps to 100-800%", () => {
    expect(clampPdfZoomPercent(50)).toBe(100);
    expect(clampPdfZoomPercent(900)).toBe(800);
    expect(clampPdfZoomPercent(275)).toBe(275);
  });

  it("returns the fit scale at 100%", () => {
    expect(pdfPercentScale(100, 0.42, 0.42)).toBeCloseTo(0.42);
  });

  it("scales the initial fit scale by percent/100 above 100%", () => {
    expect(pdfPercentScale(200, 0.42, 0.42)).toBeCloseTo(0.84);
    expect(pdfPercentScale(125, 0.4, 0.4)).toBeCloseTo(0.5);
  });

  it("preserves fit-relative zoom for very wide PDF pages", () => {
    const fit = pdfFitScale(1000, 700, 24000, 2000);
    expect(24000 * fit).toBeLessThanOrEqual(1000);
    expect(pdfPercentScale(125, fit, fit)).toBeCloseTo(fit * 1.25);
  });

  it("never returns a degenerate scale", () => {
    expect(pdfPercentScale(100, 0, undefined)).toBe(1);
    expect(pdfPercentScale(300, 0.5, undefined)).toBeGreaterThan(0.08);
  });
});

describe("PDF raster budgets and spread fit", () => {
  it("bounds bitmap area and side length at 800% while preserving logical zoom", () => {
    for (const [width, height, dpr] of [
      [800, 1100, 3],
      [6400, 8800, 3],
      [24000, 2000, 2],
    ]) {
      const scale = pdfRasterScale(width!, height!, dpr!);
      expect(width! * height! * scale * scale).toBeLessThanOrEqual(4_000_001);
      expect(Math.max(width!, height!) * scale).toBeLessThanOrEqual(8192);
    }
  });
  it("fits both pages including the gutter inside the viewport", () => {
    const scale = pdfFitScale(1024, 600, 595, 842, 2);
    expect(595 * scale * 2 + 18).toBeLessThanOrEqual(1024);
    expect(842 * scale).toBeLessThanOrEqual(600);
  });
});
