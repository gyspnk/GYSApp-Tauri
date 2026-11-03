import { describe, expect, it } from "vitest";
import { stripQuotationMarks } from "./online-content.js";

describe("stripQuotationMarks", () => {
  it("drops the curly quotes wrapping the attribution", () => {
    expect(
      stripQuotationMarks("“Sdri. Arry Widarti, Gereja cabang Fatmawati”"),
    ).toBe("Sdri. Arry Widarti, Gereja cabang Fatmawati");
  });

  it("drops straight quotes and surrounding spaces", () => {
    expect(stripQuotationMarks('  "Sdr. Budi, Jemaat Bandung"  ')).toBe(
      "Sdr. Budi, Jemaat Bandung",
    );
  });

  it("keeps inner quotation marks and plain text untouched", () => {
    expect(stripQuotationMarks("Sdri. Ani ‘tetap’ setia")).toBe(
      "Sdri. Ani ‘tetap’ setia",
    );
    expect(stripQuotationMarks("Sdr. Joko")).toBe("Sdr. Joko");
  });
});
