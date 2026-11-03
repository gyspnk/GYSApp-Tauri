import { describe, expect, it } from "vitest";
import { prefersSmallImages } from "./network-hints.js";

describe("prefersSmallImages", () => {
  it("says no without a connection object", () => {
    expect(prefersSmallImages(undefined)).toBe(false);
    expect(prefersSmallImages({})).toBe(false);
  });

  it("honours the data saver flag", () => {
    expect(prefersSmallImages({ connection: { saveData: true } })).toBe(true);
  });

  it("treats 2g and 3g as slow", () => {
    expect(prefersSmallImages({ connection: { effectiveType: "3g" } })).toBe(
      true,
    );
    expect(
      prefersSmallImages({ connection: { effectiveType: "slow-2g" } }),
    ).toBe(true);
  });

  it("keeps the full image on 4g", () => {
    expect(prefersSmallImages({ connection: { effectiveType: "4g" } })).toBe(
      false,
    );
  });
});
