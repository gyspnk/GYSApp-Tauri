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
  resolveHymnMidiDefaults,
  warmHymnPdfMeta,
} from "./hymn-pdf-meta.js";

const item = { id: "hymn-001", number: 1 } as HymnCatalogEntry;

describe("per-song hymn PDF metadata cache", () => {
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
    await expect(warmHymnPdfMeta(item)).resolves.toMatchObject({ tempo: 84 });
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
