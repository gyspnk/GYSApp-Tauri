import { describe, expect, it, vi } from "vitest";
import {
  clampPdfZoom,
  cleanupPdfPage,
  disposePdfDocument,
  nextPdfPage,
  pdfDocumentSourceOptions,
  pdfPageWindow,
  shouldRenderPdfPage,
} from "./pdf-utils.js";

describe("PDF reader controls", () => {
  it("clamps zoom to a readable range", () => {
    expect(clampPdfZoom(0.1)).toBe(0.5);
    expect(clampPdfZoom(1.25)).toBe(1.25);
    expect(clampPdfZoom(4)).toBe(3);
  });

  it("keeps page navigation within the document", () => {
    expect(nextPdfPage(1, 10, 1)).toBe(2);
    expect(nextPdfPage(1, 10, -1)).toBe(1);
    expect(nextPdfPage(10, 10, 1)).toBe(10);
  });

  it("keeps only the initial or near-viewport pages rendered", () => {
    expect(shouldRenderPdfPage(1, false)).toBe(true);
    expect(shouldRenderPdfPage(2, false)).toBe(true);
    expect(shouldRenderPdfPage(3, false)).toBe(false);
    expect(shouldRenderPdfPage(42, true)).toBe(true);
  });

  it("configures URL-backed documents for range loading without changing byte-backed fallback", () => {
    const urlOptions = pdfDocumentSourceOptions("https://cdn.example/kr.pdf");
    expect(urlOptions).toMatchObject({
      url: "https://cdn.example/kr.pdf",
      rangeChunkSize: 64 * 1024,
      disableAutoFetch: true,
      disableStream: true,
    });

    const bytes = new Uint8Array([1, 2, 3]);
    const dataOptions = pdfDocumentSourceOptions("ignored", bytes);
    expect(dataOptions).toEqual({ data: bytes });
    if (!("data" in dataOptions)) throw new Error("Expected byte source");
    expect(dataOptions.data).not.toBe(bytes);
  });

  it("limits a shared master PDF to the mapped hymn page window", () => {
    expect(pdfPageWindow(158, 2, 649)).toEqual({
      start: 158,
      end: 159,
      total: 2,
    });
    expect(pdfPageWindow(1, undefined, 3)).toEqual({
      start: 1,
      end: 3,
      total: 3,
    });
  });

  it("disposes a PDF document without turning cleanup failures into UI errors", async () => {
    const cleanup = vi
      .fn<() => Promise<void>>()
      .mockRejectedValue(new Error("already destroyed"));

    await expect(disposePdfDocument({ cleanup })).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledOnce();
    await expect(disposePdfDocument(undefined)).resolves.toBeUndefined();
  });

  it("cleans up a page safely when a stale render resolves after navigation", () => {
    const cleanup = vi.fn<() => boolean>().mockImplementation(() => {
      throw new Error("page already detached");
    });

    expect(() => cleanupPdfPage({ cleanup })).not.toThrow();
    expect(cleanup).toHaveBeenCalledOnce();
  });
});
