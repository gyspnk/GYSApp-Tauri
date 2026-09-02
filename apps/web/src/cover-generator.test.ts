import { describe, expect, it } from "vitest";
import { generateCoverSvg, getCoverDataUri } from "./cover-generator.js";

describe("cover-generator", () => {
  it("generates an SVG with category theme and initials", () => {
    const svg = generateCoverSvg({
      title: "Pimpinan Tuhan Di Masa Sukar",
      category: "kesaksian",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("KESAKSIAN");
    expect(svg).toContain("PTD");
    expect(svg).toContain("TJC GYS");
  });

  it("handles empty title and unknown category gracefully", () => {
    const svg = generateCoverSvg({
      title: "",
      category: "custom-cat",
    });
    expect(svg).toContain("<svg");
    expect(svg).toContain("GYS");
  });

  it("produces valid data URI", () => {
    const dataUri = getCoverDataUri({
      title: "Hadiah Terindah",
      category: "warta",
    });
    expect(dataUri.startsWith("data:image/svg+xml;utf8,")).toBe(true);
    expect(dataUri).toContain("WARTA");
  });
});
