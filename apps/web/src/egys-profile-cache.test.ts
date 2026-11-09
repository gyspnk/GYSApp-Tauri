import { afterEach, describe, expect, it, vi } from "vitest";
import { readCachedEgysProfile } from "./egys.js";

function stubCache(value: string | null) {
  vi.stubGlobal("localStorage", { getItem: () => value });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("cached e-GYS profile without the zod schema", () => {
  it("reads a profile the sign-in flow stored", () => {
    stubCache(
      JSON.stringify({ id: "u-1", displayName: "Gilbert", email: "a@b.co" }),
    );
    expect(readCachedEgysProfile()).toEqual({
      id: "u-1",
      displayName: "Gilbert",
      email: "a@b.co",
    });
  });

  it("rejects a cache without the required fields", () => {
    stubCache(JSON.stringify({ id: "u-1" }));
    expect(readCachedEgysProfile()).toBeUndefined();
  });

  it("rejects a cache that is not an object", () => {
    stubCache(JSON.stringify("u-1"));
    expect(readCachedEgysProfile()).toBeUndefined();
  });
});
