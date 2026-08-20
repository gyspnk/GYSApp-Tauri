import { describe, expect, it, beforeEach } from "vitest";
import {
  ACCENT_PRESETS,
  DEFAULT_ACCENT_COLOR,
  getAccentColor,
  setAccentColor,
  setAccentStorageForTesting,
  subscribeAccentColor,
  type AccentStorage,
} from "./accent-color.js";

describe("accent-color", () => {
  let map: Map<string, string>;
  let mockStorage: AccentStorage;

  beforeEach(() => {
    map = new Map<string, string>();
    mockStorage = {
      getItem: (k) => map.get(k) ?? null,
      setItem: (k, v) => void map.set(k, v),
      removeItem: (k) => void map.delete(k),
    };
    setAccentStorageForTesting(mockStorage);
    setAccentColor(DEFAULT_ACCENT_COLOR);
  });

  it("exposes default accent color and presets", () => {
    expect(getAccentColor()).toBe(DEFAULT_ACCENT_COLOR);
    expect(ACCENT_PRESETS.length).toBeGreaterThanOrEqual(8);
    expect(ACCENT_PRESETS[0]!.color).toBe(DEFAULT_ACCENT_COLOR);
  });

  it("updates accent color and notifies subscribers", () => {
    let notified = 0;
    const unsubscribe = subscribeAccentColor(() => {
      notified += 1;
    });

    setAccentColor("#059669");
    expect(getAccentColor()).toBe("#059669");
    expect(notified).toBe(1);
    expect(mockStorage.getItem("gys-accent-color")).toBe("#059669");

    unsubscribe();
    setAccentColor("#e11d48");
    expect(notified).toBe(1);
  });

  it("resets to default when setting default accent color", () => {
    setAccentColor("#e11d48");
    expect(mockStorage.getItem("gys-accent-color")).toBe("#e11d48");

    setAccentColor(DEFAULT_ACCENT_COLOR);
    expect(getAccentColor()).toBe(DEFAULT_ACCENT_COLOR);
    expect(mockStorage.getItem("gys-accent-color")).toBeNull();
  });
});
