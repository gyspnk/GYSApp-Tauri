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
