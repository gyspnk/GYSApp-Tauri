import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HymnCatalogEntry } from "@gys/contracts";
import { loadForkHymnalPdf } from "./fork-pdf.js";

vi.mock("./fork-pdf.js", () => ({
  loadForkHymnalPdf: vi.fn(async () => ({ src: "master.pdf", initialPage: 5 })),
}));

vi.mock("./pdf-worker.js", () => ({ workerSrc: "mock-worker.mjs" }));

const { getPage } = vi.hoisted(() => ({
  getPage: vi.fn(async () => ({
    getTextContent: async () => ({ items: [{ str: "♩= 84 do=G" }] }),
  })),
}));

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      getPage,
    }),
    destroy: async () => undefined,
  }),
}));

import {
  _resetHymnPdfMetaCacheForTest,
  getHymnPdfMeta,
  PDF_META_TIMEOUT_MS,
  rememberHymnPdfMeta,
  resolveHymnMidiDefaults,
  warmHymnPdfMeta,
} from "./hymn-pdf-meta.js";

const item = { id: "hymn-001", number: 1 } as HymnCatalogEntry;

describe("per-song hymn PDF metadata cache", () => {
  it("falls back when the master read hangs past the deadline", async () => {
    _resetHymnPdfMetaCacheForTest();
    vi.useFakeTimers();
    vi.mocked(loadForkHymnalPdf).mockImplementationOnce(
      () => new Promise(() => undefined),
    );
    const pending = warmHymnPdfMeta(item);
    await vi.advanceTimersByTimeAsync(PDF_META_TIMEOUT_MS + 5);
    await expect(pending).resolves.toMatchObject({ preloadTranspose: 0 });
    expect(getPage).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
  it("reuses the displayed score's published key without opening the master again", async () => {
    _resetHymnPdfMetaCacheForTest();
    const before = vi.mocked(loadForkHymnalPdf).mock.calls.length;
    const displayed = {
      key: "Es",
      keySemitone: 3,
      tempo: 76,
      preloadTranspose: -1,
    };
    rememberHymnPdfMeta(item.id, displayed);
    expect(await warmHymnPdfMeta(item)).toBe(displayed);
    expect(vi.mocked(loadForkHymnalPdf).mock.calls.length).toBe(before);
  });
  beforeEach(() => {
    _resetHymnPdfMetaCacheForTest();
    getPage.mockClear();
  });
  afterEach(async () =>
    (await import("./pdf-document-cache.js")).pdfDocuments.clearIdle(),
  );

  it("makes extracted tempo available to the synchronous MIDI load path", async () => {
    const pending = warmHymnPdfMeta(item);
    expect(getHymnPdfMeta(item.id)).toBeUndefined();

    await expect(pending).resolves.toMatchObject({ tempo: 84, key: "G" });
    expect(getHymnPdfMeta(item.id)).toMatchObject({ tempo: 84, key: "G" });
    expect(getPage).toHaveBeenCalledWith(5);
    expect(vi.mocked(loadForkHymnalPdf)).toHaveBeenCalledWith("hymn-001");
  });

  it("uses the upstream fallback tempo when the source PDF is unavailable", async () => {
    vi.mocked(loadForkHymnalPdf).mockRejectedValueOnce(new Error("offline"));

    await expect(warmHymnPdfMeta(item)).resolves.toMatchObject({
      tempo: 76,
      preloadTranspose: 0,
    });
    expect(getHymnPdfMeta(item.id)).toBeUndefined();
    // A failed master read is not retried immediately; see the cooldown test.
    await expect(warmHymnPdfMeta(item)).resolves.toMatchObject({ tempo: 76 });
  });

  it("does not retry a failed master read for a minute", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-05T00:00:00Z"));
      vi.mocked(loadForkHymnalPdf).mockRejectedValueOnce(new Error("offline"));
      const calls = vi.mocked(loadForkHymnalPdf).mock.calls.length;

      await expect(warmHymnPdfMeta(item)).resolves.toMatchObject({
        tempo: 76,
      });
      await expect(warmHymnPdfMeta(item)).resolves.toMatchObject({
        tempo: 76,
      });
      expect(vi.mocked(loadForkHymnalPdf).mock.calls.length).toBe(calls + 1);

      vi.setSystemTime(new Date("2026-11-05T00:01:01Z"));
      await expect(warmHymnPdfMeta(item)).resolves.toMatchObject({
        tempo: 84,
      });
      expect(vi.mocked(loadForkHymnalPdf).mock.calls.length).toBe(calls + 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("resolves per-song tempo and natural-chord transpose defaults", () => {
    expect(
      resolveHymnMidiDefaults({ tempo: 84, preloadTranspose: -1 }, true),
    ).toEqual({ tempo: 84, transpose: -1 });
    expect(
      resolveHymnMidiDefaults({ tempo: 84, preloadTranspose: -1 }, false),
    ).toEqual({ tempo: 84, transpose: 0 });
    expect(resolveHymnMidiDefaults(undefined, true)).toEqual({
      tempo: 76,
      transpose: 0,
    });
  });
});
