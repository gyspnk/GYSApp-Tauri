import { describe, expect, it } from "vitest";
import { clampPdfZoom, nextPdfPage } from "./pdf-utils.js";

describe("PDF reader controls", () => {
  it("clamps zoom to a readable range", () => {
    expect(clampPdfZoom(0.1)).toBe(0.5);
    expect(clampPdfZoom(1.25)).toBe(1.25);
    expect(clampPdfZoom(4)).toBe(3);
  });

  it("keeps page navigation within the document", () => {
    expect(nextPdfPage(1, 10, 1)).toBe(2);
    expect(nextPdfPage(1, 10, -1)).toBe(1);
    expect(nextPdfPage(10, 10, 1)).toBe(10);
  });
});
