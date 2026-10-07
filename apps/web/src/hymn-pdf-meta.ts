/**
 * Per-song PDF metadata (tempo + key) extracted from the first page text of
 * the verified fork PDF. Mirrors gyschordweb `_tempoByPdfHref` /
 * `_preloadTransposeByPdfHref` caches: extraction happens once per song, and
 * the MIDI load path reads the cached value synchronously.
 */
import {
  detectPreloadTransposeFromPdfText,
  extractPdfKeyFromText,
  extractPdfTempoFromText,
  MIDI_TEMPO_FALLBACK_BPM,
  parsePdfKeyToSemitone,
} from "./pdf-meta.js";
import { loadForkHymnalPdf } from "./fork-pdf.js";
import type { HymnCatalogEntry } from "@gys/contracts";

export type HymnPdfMeta = {
  tempo?: number;
  key?: string;
  keySemitone?: number | null;
  preloadTranspose?: number;
};

export function resolveHymnMidiDefaults(
  meta: HymnPdfMeta | undefined,
  preferNaturalChords: boolean,
): { tempo: number; transpose: number } {
  return {
    tempo: Number.isFinite(meta?.tempo)
      ? (meta?.tempo as number)
      : MIDI_TEMPO_FALLBACK_BPM,
    transpose: preferNaturalChords ? (meta?.preloadTranspose ?? 0) : 0,
  };
}

const cache = new Map<string, Promise<HymnPdfMeta>>();
const settledCache = new Map<string, HymnPdfMeta>();
const listeners = new Set<() => void>();

export function subscribeHymnPdfMeta(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Publish metadata detected from the exact PDF displayed by the reader. */
export function rememberHymnPdfMeta(songId: string, meta: HymnPdfMeta): void {
  settledCache.set(songId, meta);
  listeners.forEach((listener) => listener());
}

async function extractPdfMeta(
  source: string | Uint8Array,
  pageNumber = 1,
): Promise<HymnPdfMeta> {
  const { pdfDocuments } = await import("./pdf-document-cache.js");
  const lease = pdfDocuments.acquire(
    typeof source === "string" ? source : "",
    typeof source === "string" ? undefined : source,
  );
  try {
    const doc = await lease.promise;
    const page = await doc.getPage(pageNumber);
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
    lease.release();
  }
}

export function extractPdfMetaFromBytes(
  bytes: Uint8Array,
): Promise<HymnPdfMeta> {
  return extractPdfMeta(bytes);
}

/** Read the song's mapped first page from the shared range-backed master. */
export function warmHymnPdfMeta(item: HymnCatalogEntry): Promise<HymnPdfMeta> {
  const settled = settledCache.get(item.id);
  if (settled) return Promise.resolve(settled);
  const existing = cache.get(item.id);
  if (existing) return existing;
  const request = loadForkHymnalPdf(item.id)
    .then(({ src, initialPage }) => extractPdfMeta(src, initialPage))
    .then((meta) => {
      settledCache.set(item.id, meta);
      listeners.forEach((listener) => listener());
      return meta;
    })
    .catch(() => {
      if (cache.get(item.id) === request) cache.delete(item.id);
      return {
        tempo: MIDI_TEMPO_FALLBACK_BPM,
        preloadTranspose: 0,
      } satisfies HymnPdfMeta;
    });
  cache.set(item.id, request);
  void request.catch(() => cache.delete(item.id));
  return request;
}

/** Synchronous read for the MIDI load path (same as gyschordweb map read). */
export function getHymnPdfMeta(songId: string): HymnPdfMeta | undefined {
  return settledCache.get(songId);
}

export function _resetHymnPdfMetaCacheForTest(): void {
  cache.clear();
  settledCache.clear();
}
