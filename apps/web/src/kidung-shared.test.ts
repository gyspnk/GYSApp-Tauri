import { describe, expect, it } from "vitest";
import { hymnCollectionLabel } from "./kidung-shared.js";

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
