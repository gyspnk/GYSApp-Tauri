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
