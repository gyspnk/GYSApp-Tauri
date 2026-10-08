import { beforeEach, describe, expect, it } from "vitest";
import {
  isLiteratureProgressCompatible,
  getRecentLiteratureIds,
  isResumeLocationValid,
  literaturePagePercent,
  literatureResourceVersion,
  normalizeLiteratureProgress,
  readLiteratureProgress,
  removeLiteratureProgress,
  saveLiteratureProgress,
} from "./literature-progress.js";

describe("literature reading progress", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      get length() {
        return values.size;
      },
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { localStorage: storage, dispatchEvent: () => true },
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
  });

  it("retains furthest progress and completion when rereading an earlier position", () => {
    const base = {
      version: 2 as const,
      resourceVersion: "v1",
      updatedAt: "2026-10-08T00:00:00Z",
      lastOpenedAt: "2026-10-08T00:00:00Z",
    };
    saveLiteratureProgress("article", {
      ...base,
      percent: 100,
      location: { kind: "scroll", ratio: 1 },
      completed: true,
    });
    saveLiteratureProgress("article", {
      ...base,
      percent: 20,
      location: { kind: "scroll", ratio: 0.2 },
    });
    expect(readLiteratureProgress().article).toMatchObject({
      percent: 100,
      completed: true,
      location: { kind: "scroll", ratio: 0.2 },
      furthestLocation: { kind: "scroll", ratio: 1 },
    });
    saveLiteratureProgress("article", {
      ...base,
      resourceVersion: "v2",
      percent: 0,
    });
    expect(readLiteratureProgress().article).toMatchObject({
      percent: 0,
      resourceVersion: "v2",
    });
    expect(readLiteratureProgress().article?.completed).toBeUndefined();
  });

  it("migrates a legacy entry and keeps the latest location", () => {
    localStorage.setItem(
      "gys-literature-progress-v1",
      JSON.stringify({
        issue: {
          percent: 40,
          updatedAt: "2026-08-14T00:00:00.000Z",
          downloadedAt: "2026-08-14T00:01:00.000Z",
        },
      }),
    );
    const result = readLiteratureProgress(new Map([["issue", "v2"]]));
    expect(result.issue).toMatchObject({
      version: 2,
      percent: 40,
      resourceVersion: "v2",
      downloadedAt: "2026-08-14T00:01:00.000Z",
    });
  });

  it("keeps separate last and furthest PDF pages", () => {
    const base = {
      version: 2 as const,
      resourceVersion: "book-v1",
      updatedAt: "2026-10-08T00:00:00Z",
      lastOpenedAt: "2026-10-08T00:00:00Z",
    };
    saveLiteratureProgress("book", {
      ...base,
      percent: 80,
      location: { kind: "page", page: 8, totalPages: 10 },
    });
    const saved = saveLiteratureProgress("book", {
      ...base,
      percent: 30,
      location: { kind: "page", page: 3, totalPages: 10 },
    });
    expect(saved).toMatchObject({
      percent: 80,
      location: { kind: "page", page: 3 },
      furthestLocation: { kind: "page", page: 8 },
    });
    expect(readLiteratureProgress().book).toEqual(saved);
  });

  it("deduplicates recent entries by id and sorts by last opened", () => {
    const first = normalizeLiteratureProgress(
      {
        percent: 10,
        updatedAt: "2026-08-14T00:00:00.000Z",
        lastOpenedAt: "2026-08-14T00:01:00.000Z",
      },
      "v1",
    );
    const second = normalizeLiteratureProgress(
      {
        percent: 20,
        updatedAt: "2026-08-14T00:02:00.000Z",
        lastOpenedAt: "2026-08-14T00:03:00.000Z",
      },
      "v1",
    );
    if (!first || !second) throw new Error("fixtures should normalize");
    saveLiteratureProgress("same", first);
    saveLiteratureProgress("other", second);
    saveLiteratureProgress("same", {
      ...first,
      lastOpenedAt: "2026-08-14T00:04:00.000Z",
    });
    expect(getRecentLiteratureIds()).toEqual(["same", "other"]);
  });

  it("rejects a page from an obsolete resource or outside its document", () => {
    expect(
      isResumeLocationValid(
        { kind: "page", page: 4, totalPages: 10 },
        "new",
        3,
        "old",
      ),
    ).toBe(false);
    expect(
      isResumeLocationValid(
        { kind: "page", page: 3, totalPages: 10 },
        "new",
        3,
        "new",
      ),
    ).toBe(true);
  });

  it("keeps non-paginated scroll positions version-aware", () => {
    expect(
      isResumeLocationValid(
        { kind: "scroll", ratio: 0.62 },
        "new",
        undefined,
        "new",
      ),
    ).toBe(true);
    expect(
      isResumeLocationValid(
        { kind: "scroll", ratio: 0.62 },
        "new",
        undefined,
        "old",
      ),
    ).toBe(false);
  });

  it("removes one history entry and its saved PDF resume page", () => {
    const progress = normalizeLiteratureProgress(
      {
        percent: 42,
        updatedAt: "2026-08-14T00:00:00.000Z",
        lastOpenedAt: "2026-08-14T00:01:00.000Z",
        resourceVersion: "v2",
        location: { kind: "page", page: 42, totalPages: 100 },
      },
      "v2",
    );
    if (!progress) throw new Error("fixture should normalize");
    saveLiteratureProgress("book", progress);
    localStorage.setItem("gys-pdf-page:literature:book:v2", "42");

    removeLiteratureProgress("book");

    expect(getRecentLiteratureIds()).toEqual([]);
    expect(localStorage.getItem("gys-pdf-page:literature:book:v2")).toBeNull();
  });

  it("shows visible progress on the first PDF page and completes on the last", () => {
    expect(literaturePagePercent(1, 324)).toBe(1);
    expect(literaturePagePercent(10, 324)).toBe(3);
    expect(literaturePagePercent(324, 324)).toBe(100);
  });

  it("keeps undated catalog entries compatible with older progress versions", () => {
    expect(literatureResourceVersion(undefined)).toBe(
      "1970-01-01T00:00:00.000Z",
    );
    expect(
      isLiteratureProgressCompatible(
        { resourceVersion: "2026-08-18T00:00:00.000Z" },
        {},
      ),
    ).toBe(true);
    expect(
      isLiteratureProgressCompatible(
        { resourceVersion: "old" },
        { publishedAt: "2026-08-18T00:00:00.000Z" },
      ),
    ).toBe(false);
  });
});
