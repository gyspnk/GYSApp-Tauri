import { describe, expect, it } from "vitest";
import { resolveCollection } from "./kidung-collection-store.js";

describe("resolveCollection", () => {
  it("opens on KR by default", () => {
    expect(resolveCollection(["rohani", "english"], "")).toBe("rohani");
  });

  it("keeps a stored book the catalogue still has", () => {
    expect(resolveCollection(["rohani", "english"], "english")).toBe("english");
  });

  it("falls back to the first book when a stored one is gone", () => {
    expect(resolveCollection(["english"], "pujian")).toBe("english");
  });
});
