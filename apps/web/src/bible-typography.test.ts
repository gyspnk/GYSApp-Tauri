import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BIBLE_FONT_SIZE_MAX,
  BIBLE_FONT_SIZE_MIN,
  DEFAULT_BIBLE_TYPOGRAPHY,
  decreaseBibleFontSize,
  increaseBibleFontSize,
  readBibleTypography,
  writeBibleTypography,
} from "./bible-typography.js";

const KEY = "gys-bible-typography-v1";

function createStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

const originalWindow = globalThis.window;

afterEach(() => {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: originalWindow,
  });
});

function stubWindow(storage: Storage) {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    },
  });
}

describe("readBibleTypography", () => {
  it("returns the default when nothing is stored", () => {
    stubWindow(createStorage());
    expect(readBibleTypography()).toEqual(DEFAULT_BIBLE_TYPOGRAPHY);
  });

  it("clamps stored values to the supported range", () => {
    const storage = createStorage();
    stubWindow(storage);
    storage.setItem(KEY, JSON.stringify({ fontSize: 99, lineHeight: 0.1 }));
    expect(readBibleTypography()).toEqual({
      fontSize: BIBLE_FONT_SIZE_MAX,
      lineHeight: 1.4,
    });
    storage.setItem(KEY, JSON.stringify({ fontSize: 4, lineHeight: 9 }));
    expect(readBibleTypography()).toEqual({
      fontSize: BIBLE_FONT_SIZE_MIN,
      lineHeight: 2.2,
    });
  });

  it("falls back for malformed or non-numeric payloads", () => {
    const storage = createStorage();
    stubWindow(storage);
    storage.setItem(KEY, "not json");
    expect(readBibleTypography()).toEqual(DEFAULT_BIBLE_TYPOGRAPHY);
    storage.setItem(KEY, JSON.stringify({ fontSize: "big", lineHeight: null }));
    expect(readBibleTypography()).toEqual(DEFAULT_BIBLE_TYPOGRAPHY);
    storage.setItem(KEY, JSON.stringify([1, 2]));
    expect(readBibleTypography()).toEqual(DEFAULT_BIBLE_TYPOGRAPHY);
  });

  it("returns the default without a window", () => {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: undefined,
    });
    expect(readBibleTypography()).toEqual(DEFAULT_BIBLE_TYPOGRAPHY);
  });
});

describe("writeBibleTypography", () => {
  it("persists a merged value and notifies subscribers", () => {
    const storage = createStorage();
    const dispatchEvent = vi.fn();
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        localStorage: storage,
        dispatchEvent,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      },
    });
    const next = writeBibleTypography({ fontSize: 20 });
    expect(next).toEqual({ fontSize: 20, lineHeight: 1.72 });
    expect(JSON.parse(storage.getItem(KEY) ?? "null")).toEqual({
      fontSize: 20,
      lineHeight: 1.72,
    });
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
  });
});

describe("font size steps", () => {
  it("moves by one bounded step", () => {
    const base = { fontSize: 18, lineHeight: 1.72 };
    expect(increaseBibleFontSize(base)).toEqual({
      fontSize: 19,
      lineHeight: 1.72,
    });
    expect(decreaseBibleFontSize(base)).toEqual({
      fontSize: 17,
      lineHeight: 1.72,
    });
    expect(
      increaseBibleFontSize({
        fontSize: BIBLE_FONT_SIZE_MAX,
        lineHeight: 1.72,
      }),
    ).toEqual({ fontSize: BIBLE_FONT_SIZE_MAX, lineHeight: 1.72 });
    expect(
      decreaseBibleFontSize({
        fontSize: BIBLE_FONT_SIZE_MIN,
        lineHeight: 1.72,
      }),
    ).toEqual({ fontSize: BIBLE_FONT_SIZE_MIN, lineHeight: 1.72 });
  });
});
