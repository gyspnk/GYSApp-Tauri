import { describe, expect, it } from "vitest";
import {
  DEFAULT_SHELL_SETTINGS,
  readShellSettings,
  writeShellSettings,
  type ShellStorage,
} from "./settings.js";

function storage(initial: Record<string, string> = {}): ShellStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
  };
}

describe("versioned shell settings", () => {
  it("falls back when the stored envelope is malformed or uses unknown values", () => {
    const malformed = storage({
      "gys-shell-settings-v1": JSON.stringify({ version: 1, locale: "xx" }),
    });
    expect(readShellSettings(malformed)).toEqual(DEFAULT_SHELL_SETTINGS);
  });

  it("migrates valid legacy locale and theme values into the versioned envelope", () => {
    const legacy = storage({ "gys-locale": "en", "gys-theme": "sepia" });

    expect(readShellSettings(legacy)).toEqual({
      version: 1,
      locale: "en",
      theme: "sepia",
    });
    expect(legacy.getItem("gys-shell-settings-v1")).toBe(
      JSON.stringify({ version: 1, locale: "en", theme: "sepia" }),
    );
  });

  it("writes the validated envelope and legacy compatibility keys", () => {
    const target = storage();
    writeShellSettings({ version: 1, locale: "zh", theme: "amoled" }, target);

    expect(target.getItem("gys-shell-settings-v1")).toBe(
      JSON.stringify({ version: 1, locale: "zh", theme: "amoled" }),
    );
    expect(target.getItem("gys-locale")).toBe("zh");
    expect(target.getItem("gys-theme")).toBe("amoled");
  });

  it("does not throw when storage rejects reads or writes", () => {
    const unavailable: ShellStorage = {
      getItem: () => {
        throw new Error("storage unavailable");
      },
      setItem: () => {
        throw new Error("storage unavailable");
      },
    };

    expect(readShellSettings(unavailable)).toEqual(DEFAULT_SHELL_SETTINGS);
    expect(() =>
      writeShellSettings(DEFAULT_SHELL_SETTINGS, unavailable),
    ).not.toThrow();
  });
});
