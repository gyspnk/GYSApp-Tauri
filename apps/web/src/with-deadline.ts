/**
 * Resolve `work`, or `fallback` when it takes longer than `timeoutMs`.
 *
 * A packaged WebView can leave an IndexedDB read pending forever after a
 * relaunch — the native soak saw no PDF request at all while the panel sat on
 * “Menyiapkan PDF…”. A bounded wait lets the caller carry on and fall back to
 * the network instead of hanging.
 */
export async function withDeadline<T>(
  work: Promise<T>,
  timeoutMs: number,
  fallback: T,
): Promise<T> {
  let timer: number | undefined;
  const deadline = new Promise<T>((resolve) => {
    timer = globalThis.setTimeout(() => resolve(fallback), timeoutMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    if (timer !== undefined) globalThis.clearTimeout(timer);
  }
}
