type IdleScheduler = {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

type ConnectionHint = {
  saveData?: boolean;
  effectiveType?: string;
};

/**
 * Warm a data snapshot while the browser is idle, so the next screen can paint
 * from the HTTP cache instead of paying a cold fetch. Skipped when the reader
 * asked to save data or is on a 2G link, because the point is speed without
 * spending their bytes.
 */
export function prefetchOnIdle(
  url: string,
  options: {
    timeoutMs?: number;
    connection?: ConnectionHint;
    fetcher?: typeof fetch;
  } = {},
): () => void {
  const { timeoutMs = 3_000, connection, fetcher = fetch } = options;
  if (
    connection?.saveData ||
    /(^|-)2g$/.test(connection?.effectiveType ?? "")
  ) {
    return () => {};
  }
  const idleWindow = window as unknown as IdleScheduler;
  let cancelled = false;
  const start = () => {
    if (cancelled) return;
    void fetcher(url, {
      cache: "force-cache",
      credentials: "same-origin",
    }).catch(() => {});
  };
  const requestIdle = idleWindow.requestIdleCallback?.bind(idleWindow);
  const handle = requestIdle
    ? requestIdle(start, { timeout: timeoutMs })
    : window.setTimeout(start, Math.min(timeoutMs, 1_200));
  return () => {
    cancelled = true;
    if (requestIdle && idleWindow.cancelIdleCallback) {
      idleWindow.cancelIdleCallback(handle);
    } else {
      window.clearTimeout(handle);
    }
  };
}
