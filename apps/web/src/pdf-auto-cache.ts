/** Documents above this are left to the explicit "save offline" button. */
export const MAX_AUTO_CACHE_BYTES = 12 * 1024 * 1024;

/** Above this the store stops auto-caching; explicit saves still work. */
export const MAX_CACHED_BYTES = 80 * 1024 * 1024;

export type PdfAutoCacheHints = {
  /** True when the viewer already renders local bytes. */
  data?: Uint8Array | undefined;
  saveData?: boolean | undefined;
  effectiveType?: string | undefined;
  /** Whole-document size when the proxy reported it. */
  bytes?: number | undefined;
  /** Bytes already stored by the asset cache. */
  cachedBytes?: number | undefined;
};

/**
 * A PDF that rendered from the network is worth keeping: the next open is then
 * local and the document also works offline. Skipped when the bytes are already
 * local, when the document is very large, or on data-saver / 2G links.
 */
export function shouldAutoCachePdf(hints: PdfAutoCacheHints): boolean {
  if (hints.data) return false;
  if ((hints.bytes ?? 0) > MAX_AUTO_CACHE_BYTES) return false;
  if ((hints.cachedBytes ?? 0) > MAX_CACHED_BYTES) return false;
  if (hints.saveData) return false;
  return !/(^|-)2g$/.test(hints.effectiveType ?? "");
}
