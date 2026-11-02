import { describe, expect, it } from "vitest";
import { formatDecimal } from "./i18n.js";

describe("formatDecimal", () => {
  it("uses the Indonesian comma separator", () => {
    expect(formatDecimal(0.9, "id")).toBe("0,9");
    expect(formatDecimal(1, "id")).toBe("1,0");
  });

  it("keeps the dot for English and Chinese", () => {
    expect(formatDecimal(0.9, "en")).toBe("0.9");
    expect(formatDecimal(1, "en")).toBe("1.0");
    expect(formatDecimal(0.9, "zh")).toBe("0.9");
  });

  it("rounds to the requested number of digits", () => {
    expect(formatDecimal(1.234, "en", 2)).toBe("1.23");
    expect(formatDecimal(1.234, "id", 2)).toBe("1,23");
  });
});
