import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_PREFERENCES,
  applyUiPreferences,
  createMemoryUiPreferenceStorage,
  readUiPreferences,
  setUiPreferences,
  subscribeUiPreferences,
  writeUiPreferences,
} from "./ui-preferences.js";

describe("ui preferences", () => {
  it("uses standard density and automatic font by default", () => {
    const storage = createMemoryUiPreferenceStorage();
    expect(readUiPreferences(storage)).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("normalizes invalid stored values instead of leaking corrupt preferences", () => {
    const storage = createMemoryUiPreferenceStorage({
      "gys-ui-preferences-v1": JSON.stringify({
        version: 1,
        density: "giant",
        font: "comic",
      }),
    });
    expect(readUiPreferences(storage)).toEqual(DEFAULT_UI_PREFERENCES);
  });

  it("persists a partial update without losing the other preference", () => {
    const storage = createMemoryUiPreferenceStorage();
    writeUiPreferences({ density: "comfortable" }, storage);
    writeUiPreferences({ font: "hymnal" }, storage);
    expect(readUiPreferences(storage)).toEqual({
      version: 1,
      density: "comfortable",
      font: "hymnal",
    });
  });

  it("applies density and font as document data attributes", () => {
    const root = { dataset: {} as Record<string, string> };
    applyUiPreferences(
      { version: 1, density: "compact", font: "sans" },
      root,
    );
    expect(root.dataset.uiDensity).toBe("compact");
    expect(root.dataset.uiFont).toBe("sans");
  });

  it("notifies subscribers when the active preference changes", () => {
    const storage = createMemoryUiPreferenceStorage();
    const listener = vi.fn();
    const unsubscribe = subscribeUiPreferences(listener);
    setUiPreferences({ density: "comfortable" }, { storage });
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
});
