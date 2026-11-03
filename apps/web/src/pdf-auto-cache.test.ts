import { describe, expect, it } from "vitest";
import { shouldAutoCachePdf } from "./pdf-auto-cache.js";

describe("shouldAutoCachePdf", () => {
  it("keeps a networked PDF on an ordinary link", () => {
    expect(shouldAutoCachePdf({ effectiveType: "4g" })).toBe(true);
  });

  it("skips bytes that are already local", () => {
    expect(shouldAutoCachePdf({ data: new Uint8Array([1]) })).toBe(false);
  });

  it("skips documents larger than the auto-cache ceiling", () => {
    expect(shouldAutoCachePdf({ bytes: 90_868_320 })).toBe(false);
    expect(shouldAutoCachePdf({ bytes: 4_000_000 })).toBe(true);
  });

  it("stops when the cache already holds a lot", () => {
    expect(shouldAutoCachePdf({ cachedBytes: 90 * 1024 * 1024 })).toBe(false);
    expect(shouldAutoCachePdf({ cachedBytes: 10 * 1024 * 1024 })).toBe(true);
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
