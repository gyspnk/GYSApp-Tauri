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

/** The pane must never wait on the fork master when the host is blocked. */
export const PDF_META_TIMEOUT_MS = 5_000;

function withMetadataTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error("PDF metadata timed out")),
      ms,
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/** Read the song's mapped first page from the shared range-backed master. */
/** A failed master read is not retried for a minute: a retry storm saturated
 * WebView2 in the packaged soak and starved the visible PDF pane. */
export const PDF_META_RETRY_COOLDOWN_MS = 60_000;
const failedAt = new Map<string, number>();

function fallbackMeta(): HymnPdfMeta {
  return { tempo: MIDI_TEMPO_FALLBACK_BPM, preloadTranspose: 0 };
}

export function warmHymnPdfMeta(item: HymnCatalogEntry): Promise<HymnPdfMeta> {
  const settled = settledCache.get(item.id);
  if (settled) return Promise.resolve(settled);
  const failed = failedAt.get(item.id);
  if (
    failed !== undefined &&
    Date.now() - failed < PDF_META_RETRY_COOLDOWN_MS
  ) {
    return Promise.resolve(fallbackMeta());
  }
  const existing = cache.get(item.id);
  if (existing) return existing;
  const request = withMetadataTimeout(
    loadForkHymnalPdf(item.id),
    PDF_META_TIMEOUT_MS,
  )
    .then(({ src, initialPage }) => extractPdfMeta(src, initialPage))
    .then((meta) => {
      failedAt.delete(item.id);
      settledCache.set(item.id, meta);
      listeners.forEach((listener) => listener());
      return meta;
    })
    .catch(() => {
      failedAt.set(item.id, Date.now());
      if (cache.get(item.id) === request) cache.delete(item.id);
      return fallbackMeta();
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
  failedAt.clear();
}
