export function clampPdfZoom(value: number): number {
  return Math.max(0.5, Math.min(3, Math.round(value * 100) / 100));
}

/** gyschordweb zoom is relative to the page-fit scale: 100%–800%. */
export function clampPdfZoomPercent(value: number): number {
  return Math.max(100, Math.min(800, Math.round(value)));
}

/**
 * Resolve the desired PDF.js scale from a fit scale (the scale that makes the
 * page fit the viewport) and the percent zoom relative to the initial fit.
 * At 100% the page keeps the fit scale; above it, the initial scale is scaled
 * by percent/100 exactly like gyschordweb's onZoom (25% steps, 100–800%).
 */
export function pdfPercentScale(
  percent: number,
  fitScale: number,
  initialScale: number | undefined,
): number {
  const safePercent = clampPdfZoomPercent(percent);
  const safeFit = Number.isFinite(fitScale) && fitScale > 0 ? fitScale : 1;
  if (safePercent === 100) return safeFit;
  const base =
    Number.isFinite(initialScale) && (initialScale ?? 0) > 0
      ? (initialScale as number)
      : safeFit;
  return Math.max(0.08, base * (safePercent / 100));
}

export type PdfDocumentSourceOptions =
  | { data: Uint8Array }
  | {
      url: string;
      rangeChunkSize: number;
      disableAutoFetch: true;
      disableStream: true;
    };

/**
 * Keep PDF.js on its HTTP range path for remote documents. A byte-backed
 * source remains available for verified offline/chord-layout fallbacks, but
 * opening a normal viewer must not eagerly copy the entire master PDF.
 */
export function pdfDocumentSourceOptions(
  src: string,
  data?: Uint8Array,
): PdfDocumentSourceOptions {
  if (data) return { data: data.slice() };
  return {
    url: src,
    rangeChunkSize: 64 * 1024,
    disableAutoFetch: true,
    disableStream: true,
  };
}

export function pdfPageWindow(
  startPage: number,
  pageCount: number | undefined,
  documentPages: number,
): { start: number; end: number; total: number } {
  const start = Math.max(1, Math.min(documentPages, Math.trunc(startPage)));
  const end = Math.min(
    documentPages,
    pageCount === undefined
      ? documentPages
      : start + Math.max(1, Math.trunc(pageCount)) - 1,
  );
  return { start, end, total: Math.max(0, end - start + 1) };
}

export type PdfLayout = "single" | "two" | "vertical" | "horizontal";

export function isPdfLayout(value: unknown): value is PdfLayout {
  return (
    value === "single" ||
    value === "two" ||
    value === "vertical" ||
    value === "horizontal"
  );
}

/** Two canvases are not readable on a narrow phone; keep the user preference
 * but choose a safe effective layout for the current viewport. */
export function pdfLayoutForViewport(
  layout: PdfLayout,
  viewportWidth: number,
): PdfLayout {
  return layout === "two" && viewportWidth < 720 ? "single" : layout;
}

export function nextPdfPage(
  page: number,
  total: number,
  delta: number,
): number {
  return Math.max(1, Math.min(total, page + delta));
}

/**
 * Keep the first pages available before IntersectionObserver has delivered its
 * first callback, then render only pages inside the preload window. The
 * virtual reader uses this predicate to release canvas memory for distant
 * pages while preserving a useful initial frame.
 */
export function shouldRenderPdfPage(
  pageNumber: number,
  isNearViewport: boolean,
  initialPages = 2,
): boolean {
  return (
    pageNumber > 0 &&
    (isNearViewport || pageNumber <= Math.max(0, initialPages))
  );
}

/**
 * PDF.js keeps page/operator resources alive until the document is cleaned up.
 * Cleanup runs during route changes and can race with an in-flight load, so a
 * second cleanup (or a worker shutdown error) must be harmless to the reader.
 */
export async function disposePdfDocument(
  documentProxy: { cleanup: () => Promise<unknown> | void } | null | undefined,
): Promise<void> {
  if (!documentProxy) return;
  try {
    await documentProxy.cleanup();
  } catch {
    // PDF.js reports an already-cancelled worker as a destroy failure. The
    // document is no longer usable, so cleanup remains successful for callers.
  }
}

/** Release page-level operator lists before the document itself is destroyed. */
export function cleanupPdfPage(
  page: { cleanup?: () => boolean | void } | null | undefined,
): void {
  try {
    page?.cleanup?.();
  } catch {
    // A page can already be detached when its IntersectionObserver exits.
  }
}
