export type PdfAutoCacheHints = {
  /** True when the viewer already renders local bytes. */
  data?: Uint8Array | undefined;
  saveData?: boolean | undefined;
  effectiveType?: string | undefined;
};

/**
 * A PDF that rendered from the network is worth keeping: the next open is then
 * local and the document also works offline. Skipped when the bytes are already
 * local or on data-saver / 2G links.
 */
export function shouldAutoCachePdf(hints: PdfAutoCacheHints): boolean {
  if (hints.data) return false;
  if (hints.saveData) return false;
  return !/(^|-)2g$/.test(hints.effectiveType ?? "");
}
