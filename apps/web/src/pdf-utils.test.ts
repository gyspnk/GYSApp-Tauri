import { describe, expect, it } from "vitest";
import { isPdfLayout, nextPdfPage, pdfLayoutForViewport } from "./pdf-utils.js";

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
