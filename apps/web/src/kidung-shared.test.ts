import { describe, expect, it } from "vitest";
import { hymnCollectionLabel, hymnPdfPageRange } from "./kidung-shared.js";

describe("hymnCollectionLabel", () => {
  it("shows the KR code for the main collection", () => {
    expect(hymnCollectionLabel("rohani")).toBe("KR");
  });

  it("keeps installed pack codes verbatim", () => {
    expect(hymnCollectionLabel("ASM-I")).toBe("ASM-I");
    expect(hymnCollectionLabel("ASM-P")).toBe("ASM-P");
    expect(hymnCollectionLabel("ASM-M")).toBe("ASM-M");
  });
});

describe("score page window", () => {
  it("gives a window to every hymnal that knows where the hymn sits", () => {
    // Both the Fork master and a distributed book state a start page and a
    // length; only the Fork one used to reach the reader.
    expect(hymnPdfPageRange({ initialPage: 17, pageCount: 1 })).toEqual({
      start: 17,
      count: 1,
    });
    expect(hymnPdfPageRange({ initialPage: 5, pageCount: 2 })).toEqual({
      start: 5,
      count: 2,
    });
  });

  it("leaves a single-song PDF unwindowed", () => {
    expect(hymnPdfPageRange({ initialPage: 1 })).toBeUndefined();
    expect(hymnPdfPageRange({ initialPage: 3, pageCount: 0 })).toBeUndefined();
  });

  it("never asks for a page before the first one", () => {
    expect(hymnPdfPageRange({ initialPage: 0, pageCount: 1 })).toEqual({
      start: 1,
      count: 1,
    });
  });
});
