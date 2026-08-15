import { beforeEach, describe, expect, it } from "vitest";
import {
  getRecentLiteratureIds,
  isResumeLocationValid,
  normalizeLiteratureProgress,
  readLiteratureProgress,
  saveLiteratureProgress,
} from "./literature-progress.js";

describe("literature reading progress", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    const storage = {
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
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
});
