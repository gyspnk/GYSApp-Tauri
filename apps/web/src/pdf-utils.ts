export function clampPdfZoom(value: number): number {
  return Math.max(0.5, Math.min(3, Math.round(value * 100) / 100));
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
