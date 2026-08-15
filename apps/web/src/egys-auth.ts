function abortError(): Error {
  const error = new Error("provider login cancelled");
  error.name = "AbortError";
  return error;
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
