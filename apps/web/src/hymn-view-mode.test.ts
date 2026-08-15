import { describe, expect, it } from "vitest";
import {
  readHymnChordVisibility,
  isHymnViewerMode,
  readHymnViewerMode,
  writeHymnChordVisibility,
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
  it("accepts only the two presentation modes", () => {
    expect(isHymnViewerMode("lyrics")).toBe(true);
    expect(isHymnViewerMode("pdf")).toBe(true);
    // Chord is a capability layered on either presentation, not a third page.
    expect(isHymnViewerMode("chord")).toBe(false);
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
      writeHymnViewerMode("hymn-001", "pdf");
      expect(readHymnViewerMode("hymn-001")).toBe("pdf");
      expect(readHymnChordVisibility("hymn-001")).toBe(false);
      writeHymnChordVisibility("hymn-001", true);
      expect(readHymnChordVisibility("hymn-001")).toBe(true);
      storage.setItem("gys-hymn-view-mode-v1", "{broken");
      expect(readHymnViewerMode("hymn-001")).toBe("lyrics");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });

  it("migrates the removed legacy chord page to the text presentation", () => {
    const storage = createStorage(
      JSON.stringify({ version: 1, modes: { "hymn-001": "chord" } }),
    );
    const originalWindow = globalThis.window;
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage },
    });
    try {
      expect(readHymnViewerMode("hymn-001")).toBe("lyrics");
    } finally {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
  });
});
