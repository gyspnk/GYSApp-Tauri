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
import { loadForkHymnalPdfBytes } from "./fork-pdf.js";
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

let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | undefined;
/**
 * Load pdf.js on first use so text-first hymn pages never pull the library
 * or the worker into the Kidung route's first-load chunk graph.
 */
async function loadPdfJs(): Promise<typeof import("pdfjs-dist")> {
  pdfjsPromise ??= import("pdfjs-dist").then(async (pdfjs) => {
    const { workerSrc } = await import("./pdf-worker.js");
    pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;
    return pdfjs;
  });
  return pdfjsPromise;
}

export async function extractPdfMetaFromBytes(
  bytes: Uint8Array,
): Promise<HymnPdfMeta> {
  const { getDocument } = await loadPdfJs();
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
    .catch(
      () =>
        ({
          tempo: MIDI_TEMPO_FALLBACK_BPM,
          preloadTranspose: 0,
        }) as HymnPdfMeta,
    )
    .then((meta) => {
      settledCache.set(item.id, meta);
      return meta;
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
