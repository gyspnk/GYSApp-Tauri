import { afterEach, expect, it, vi } from "vitest";
import { runStorageMigrations } from "./storage.js";

afterEach(() => vi.unstubAllGlobals());

it("does not prevent startup when migration metadata cannot be persisted", () => {
  const storage = {
    length: 0,
    key: () => null,
    getItem: () => null,
    setItem: () => {
      throw new DOMException("Storage full", "QuotaExceededError");
    },
  };
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", storage);
  expect(() => runStorageMigrations()).not.toThrow();
  expect(runStorageMigrations().changed).toBe(false);
});

it("upgrades preferences without deleting last-good articles or the active offline shell", async () => {
  const key = "gys_article_cache_https://tjc.org/id/suarasejati/saved/";
  const article = JSON.stringify({
    id: "saved",
    title: "Saved article",
    body: "Complete offline article",
    url: "https://tjc.org/id/suarasejati/saved/",
    source: "tjc.org",
    fetchedAt: "2026-10-08T00:00:00.000Z",
  });
  const values = new Map([
    [
      "gys-storage-meta-v1",
      JSON.stringify({ version: 2, migratedAt: "2026-10-08T00:00:00.000Z" }),
    ],
    [key, article],
    ["gys_sauh_cached_2026-10-08", "old feed parser output"],
  ]);
  const storage = {
    get length() {
      return values.size;
    },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
  const removeShell = vi.fn(async () => true);
  vi.stubGlobal("window", {});
  vi.stubGlobal("localStorage", storage);
  vi.stubGlobal("caches", {
    keys: async () => ["gysapp-shell-v25-active"],
    delete: removeShell,
  });
  expect(runStorageMigrations()).toEqual({ version: 3, changed: true });
  await Promise.resolve();
  await Promise.resolve();
  expect(values.get(key)).toBe(article);
  expect(values.has("gys_sauh_cached_2026-10-08")).toBe(false);
  expect(removeShell).not.toHaveBeenCalled();
  expect(runStorageMigrations().changed).toBe(false);
});
