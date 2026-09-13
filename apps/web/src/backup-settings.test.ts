import { describe, expect, it } from "vitest";
import {
  collectPortableBackupSettings,
  isPortableBackupSetting,
  restorePortableBackupSettings,
} from "./backup-settings.js";

function memoryStorage(initial: Record<string, string> = {}): Storage {
  const values = new Map(Object.entries(initial));
  return {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  } as unknown as Storage;
}

describe("portable backup settings", () => {
  it("collects durable settings and dynamic reading data only", () => {
    const storage = memoryStorage({
      "gys-accent-color": "#355c9a",
      "gys-ui-preferences-v1": JSON.stringify({
        version: 1,
        density: "comfortable",
        font: "hymnal",
      }),
      "gys-faith-note-1": "portable note",
      "gys-asset-index-v1": "cache pointer",
      "gys-egys-session-v1": "private session",
      "gys-unlisted-device-state": "private state",
    });

    expect(collectPortableBackupSettings(storage)).toEqual({
      "gys-accent-color": "#355c9a",
      "gys-ui-preferences-v1": JSON.stringify({
        version: 1,
        density: "comfortable",
        font: "hymnal",
      }),
      "gys-faith-note-1": "portable note",
    });
    expect(isPortableBackupSetting("gys-ui-preferences-v1")).toBe(true);
    expect(isPortableBackupSetting("gys-asset-index-v1")).toBe(false);
    expect(isPortableBackupSetting("gys-active-asset-manifest-v1")).toBe(false);
    expect(isPortableBackupSetting("gys-chord-cache-index-v1")).toBe(false);
  });

  it("restores only explicitly portable settings from a valid payload", () => {
    const storage = memoryStorage();
    const restored = restorePortableBackupSettings(
      {
        "gys-accent-color": "#355c9a",
        "gys-ui-preferences-v1": JSON.stringify({
          version: 1,
          density: "compact",
          font: "sans",
        }),
        "gys-faith-note-1": "portable note",
        "gys-live-v1-token": "injected token",
        "gys-egys-session-v1": "injected session",
        "gys-custom-edge-endpoint-v1": "https://injected.invalid/tts",
        "gys-asset-index-v1": "cache pointer",
        "gys-unlisted-device-state": "private state",
      },
      storage,
    );

    expect(restored).toBe(3);
    expect(storage.getItem("gys-accent-color")).toBe("#355c9a");
    expect(storage.getItem("gys-ui-preferences-v1")).toContain('"compact"');
    expect(storage.getItem("gys-faith-note-1")).toBe("portable note");
    expect(storage.getItem("gys-live-v1-token")).toBeNull();
    expect(storage.getItem("gys-egys-session-v1")).toBeNull();
    expect(storage.getItem("gys-custom-edge-endpoint-v1")).toBeNull();
    expect(storage.getItem("gys-asset-index-v1")).toBeNull();
    expect(storage.getItem("gys-unlisted-device-state")).toBeNull();
  });

  it("rejects malformed settings payloads", () => {
    expect(() => restorePortableBackupSettings(null, memoryStorage())).toThrow(
      "settings missing",
    );
    expect(() => restorePortableBackupSettings([], memoryStorage())).toThrow(
      "settings missing",
    );
  });
});
