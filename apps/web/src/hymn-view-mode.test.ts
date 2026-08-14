import { describe, expect, it } from "vitest";
import {
  isHymnViewerMode,
  readHymnViewerMode,
  writeHymnViewerMode,
} from "./hymn-view-mode.js";

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

describe("hymn viewer mode preference", () => {
  it("accepts only the three mutually exclusive modes", () => {
    expect(isHymnViewerMode("lyrics")).toBe(true);
    expect(isHymnViewerMode("chord")).toBe(true);
    expect(isHymnViewerMode("pdf")).toBe(true);
    expect(isHymnViewerMode("lyrics+pdf")).toBe(false);
  });

  it("round-trips a per-song preference and ignores corrupt data", () => {
    const storage = createStorage();
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    try {
      expect(readHymnViewerMode("hymn-001")).toBe("lyrics");
      writeHymnViewerMode("hymn-001", "chord");
      expect(readHymnViewerMode("hymn-001")).toBe("chord");
      storage.setItem("gys-hymn-view-mode-v1", "{broken");
      expect(readHymnViewerMode("hymn-001")).toBe("lyrics");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
