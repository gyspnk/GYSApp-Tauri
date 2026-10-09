/** PDF.js can revise totals and finish parsing before a range download completes. */
export function pdfDownloadPercent(loaded: number, total: number) {
  if (!Number.isFinite(loaded) || !Number.isFinite(total) || total <= 0)
    return undefined;
  return Math.max(0, Math.min(100, Math.floor((loaded / total) * 100)));
}

/** Treat byte activity as progress, including increments smaller than one percent. */
export function createPdfLoadActivity(startedAt: number) {
  let lastActivity = startedAt;
  let loaded = 0;
  let interval = 0;
  return {
    update(bytes: number, now: number) {
      if (!Number.isFinite(bytes) || bytes <= loaded) return false;
      interval = Math.max(0, now - lastActivity);
      lastActivity = now;
      loaded = bytes;
      return true;
    },
    delay() {
      return Math.min(30_000, Math.max(12_000, interval * 4));
    },
  };
}
