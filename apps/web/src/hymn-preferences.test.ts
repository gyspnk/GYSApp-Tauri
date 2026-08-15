import { describe, expect, it } from "vitest";
import {
  DEFAULT_HYMN_TYPOGRAPHY,
  readHymnTypography,
  writeHymnTypography,
} from "./hymn-preferences.js";

function createStorage(initial?: string): Storage {
  let value = initial ?? null;
  return {
    getItem: () => value,
    setItem: (_key, next) => {
      value = next;
    },
    removeItem: () => {
      value = null;
    },
    clear: () => {
      value = null;
    },
    key: () => null,
    get length() {
      return value === null ? 0 : 1;
    },
  };
}

describe("hymn typography preferences", () => {
  it("clamps and round-trips a bounded per-song reader preference", () => {
    const storage = createStorage();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    try {
      expect(readHymnTypography("hymn-001")).toEqual(DEFAULT_HYMN_TYPOGRAPHY);
      writeHymnTypography("hymn-001", { fontSize: 40, lineHeight: 0.4 });
      expect(readHymnTypography("hymn-001")).toEqual({
        fontSize: 28,
        lineHeight: 1.4,
      });
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("drops malformed entries instead of leaking them into the reader", () => {
    const storage = createStorage(
      JSON.stringify({
        version: 1,
        songs: {
          good: { fontSize: 22, lineHeight: 1.8 },
          bad: { fontSize: "22", lineHeight: null },
        },
      }),
    );
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    try {
      expect(readHymnTypography("good")).toEqual({
        fontSize: 22,
        lineHeight: 1.8,
      });
      expect(readHymnTypography("bad")).toEqual(DEFAULT_HYMN_TYPOGRAPHY);
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
