import { describe, expect, it } from "vitest";
import { providerPhone } from "./egys-whatsapp.js";

describe("providerPhone", () => {
  it("keeps an already-normalized number", () => {
    expect(providerPhone("628987654321")).toBe("628987654321");
  });

  it("drops the plus sign and separators", () => {
    expect(providerPhone("+62 898-765-4321")).toBe("628987654321");
  });

  it("rewrites a local leading zero to the country code", () => {
    expect(providerPhone("0898 7654 321")).toBe("628987654321");
  });
});
