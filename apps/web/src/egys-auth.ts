function abortError(): Error {
  const error = new Error("provider login cancelled");
  error.name = "AbortError";
  return error;
}

/**
 * Reserve a popup during the user gesture without asking the browser to
 * return a deliberately detached WindowProxy. `noopener` is applied after
 * the blank same-origin window is created so popup-blocker detection remains
 * accurate; the opener relationship is severed before any external URL is
 * assigned.
 */
export function reserveAuthPopup(): Window | undefined {
  const popup = window.open("about:blank", "_blank");
  if (!popup) return undefined;
  try {
    popup.opener = null;
  } catch {
    // A restrictive webview may expose a read-only opener. The popup is still
    // usable; the blank page has not navigated to the external origin yet.
  }
  return popup;
}

/** Prevent SDK popups/promises from leaving the account surface in busy state. */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (signal?.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = globalThis.setTimeout(
      () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("provider login timed out"));
      },
      Math.max(1, timeoutMs),
    );
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };
    const cleanup = () => {
      globalThis.clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      },
    );
  });
}
