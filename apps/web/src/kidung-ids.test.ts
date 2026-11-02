import { describe, expect, it } from "vitest";
import { canonicalHymnId, splitHymnFallback } from "./kidung-ids.js";

describe("canonicalHymnId", () => {
  it("pads a bare number to the printed song id", () => {
    expect(canonicalHymnId("1")).toBe("hymn-001");
    expect(canonicalHymnId("51")).toBe("hymn-051");
    expect(canonicalHymnId("530")).toBe("hymn-530");
  });

  it("keeps the letter suffix of split hymns", () => {
    expect(canonicalHymnId("51a")).toBe("hymn-051A");
    expect(canonicalHymnId("124B")).toBe("hymn-124B");
  });

  it("leaves canonical ids and unknown values alone", () => {
    expect(canonicalHymnId("hymn-001")).toBeUndefined();
    expect(canonicalHymnId("kidung-001")).toBeUndefined();
    expect(canonicalHymnId("1234")).toBeUndefined();
    expect(canonicalHymnId("")).toBeUndefined();
  });
});

describe("splitHymnFallback", () => {
  const ids = ["hymn-050", "hymn-051A", "hymn-051B", "hymn-052", "hymn-124A"];

  it("points a missing plain number at its first split part", () => {
    expect(splitHymnFallback("hymn-051", ids)).toBe("hymn-051A");
    expect(splitHymnFallback("hymn-124", ids)).toBe("hymn-124A");
  });

  it("leaves numbers that exist on their own alone", () => {
    expect(splitHymnFallback("hymn-052", ids)).toBeUndefined();
    expect(splitHymnFallback("hymn-053", ids)).toBeUndefined();
    expect(splitHymnFallback("hymn-051A", ids)).toBeUndefined();
  });
});
