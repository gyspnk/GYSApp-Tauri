import { describe, expect, it } from "vitest";
import { shouldAutoCachePdf } from "./pdf-auto-cache.js";

describe("shouldAutoCachePdf", () => {
  it("keeps a networked PDF on an ordinary link", () => {
    expect(shouldAutoCachePdf({ effectiveType: "4g" })).toBe(true);
  });

  it("skips bytes that are already local", () => {
    expect(shouldAutoCachePdf({ data: new Uint8Array([1]) })).toBe(false);
  });

  it("skips data-saver and 2G links", () => {
    expect(shouldAutoCachePdf({ saveData: true })).toBe(false);
    expect(shouldAutoCachePdf({ effectiveType: "2g" })).toBe(false);
    expect(shouldAutoCachePdf({ effectiveType: "slow-2g" })).toBe(false);
  });

  it("keeps caching on 3G", () => {
    expect(shouldAutoCachePdf({ effectiveType: "3g" })).toBe(true);
  });
});
