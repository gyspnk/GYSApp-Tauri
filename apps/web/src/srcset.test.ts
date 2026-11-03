import { describe, expect, it } from "vitest";
import { pickSmallCandidate } from "./srcset.js";

describe("pickSmallCandidate", () => {
  it("returns the narrowest width that still covers a phone hero", () => {
    expect(
      pickSmallCandidate(
        "https://x/768.png 768w, https://x/300.png 300w, https://x/150.png 150w",
      ),
    ).toBe("https://x/300.png");
  });

  it("falls back to the smallest when every candidate is tiny", () => {
    expect(pickSmallCandidate("https://x/150.png 150w")).toBe(
      "https://x/150.png",
    );
  });

  it("ignores entries without a width or without a remote url", () => {
    expect(pickSmallCandidate("/assets/local.png 200w, https://x/a.png")).toBe(
      undefined,
    );
  });

  it("returns nothing without a list", () => {
    expect(pickSmallCandidate(undefined)).toBe(undefined);
  });
});
