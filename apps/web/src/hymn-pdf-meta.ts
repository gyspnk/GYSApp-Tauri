/**
 * Per-song PDF metadata (tempo + key) extracted from the first page text of
 * the verified fork PDF. Mirrors gyschordweb `_tempoByPdfHref` /
 * `_preloadTransposeByPdfHref` caches: extraction happens once per song, and
 * the MIDI load path reads the cached value synchronously.
 */
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import { workerSrc } from "./pdf-worker.js";
import {
  detectPreloadTransposeFromPdfText,
  extractPdfKeyFromText,
  extractPdfTempoFromText,
  parsePdfKeyToSemitone,
} from "./pdf-meta.js";
import { loadForkHymnalPdfBytes } from "./fork-pdf.js";
import type { HymnCatalogEntry } from "@gys/contracts";

GlobalWorkerOptions.workerSrc = workerSrc;

export type HymnPdfMeta = {
  tempo?: number;
  key?: string;
  keySemitone?: number | null;
  preloadTranspose?: number;
};

const cache = new Map<string, Promise<HymnPdfMeta>>();

export async function extractPdfMetaFromBytes(
  bytes: Uint8Array,
): Promise<HymnPdfMeta> {
  const task = getDocument({ data: bytes.slice() });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const content = await page.getTextContent();
    const text = content.items
      .flatMap((item) => ("str" in item ? [item.str] : []))
      .join(" ");
    const tempo = extractPdfTempoFromText(text);
    const key = extractPdfKeyFromText(text);
    return {
      tempo,
      ...(key ? { key } : {}),
      keySemitone: parsePdfKeyToSemitone(key),
      preloadTranspose: detectPreloadTransposeFromPdfText(text),
    };
  } finally {
    await task.destroy().catch(() => undefined);
  }
}

/** Warm the cache from the same immutable fork bytes the chord layer uses. */
export function warmHymnPdfMeta(item: HymnCatalogEntry): Promise<HymnPdfMeta> {
  const existing = cache.get(item.id);
  if (existing) return existing;
  const request = loadForkHymnalPdfBytes(item.number)
    .then(({ bytes }) => extractPdfMetaFromBytes(bytes))
    .catch(() => ({ preloadTranspose: 0 }) as HymnPdfMeta);
  cache.set(item.id, request);
  void request.catch(() => cache.delete(item.id));
  return request;
}

/** Synchronous read for the MIDI load path (same as gyschordweb map read). */
export function getHymnPdfMeta(songId: string): HymnPdfMeta | undefined {
  const entry = cache.get(songId);
  if (entry === undefined) return undefined;
  let settled: HymnPdfMeta | undefined;
  entry.then(
    (value) => {
      settled = value;
    },
    () => undefined,
  );
  return settled;
}

export function _resetHymnPdfMetaCacheForTest(): void {
  cache.clear();
}
