import { describe, expect, it } from "vitest";
import {
  readSidebarCollapsed,
  writeSidebarCollapsed,
} from "./shell-preferences.js";

function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

describe("desktop sidebar preference", () => {
  it("defaults expanded and persists both states", () => {
    const storage = memoryStorage();
    expect(readSidebarCollapsed(storage)).toBe(false);
    writeSidebarCollapsed(storage, true);
    expect(readSidebarCollapsed(storage)).toBe(true);
    writeSidebarCollapsed(storage, false);
    expect(readSidebarCollapsed(storage)).toBe(false);
  });
});
