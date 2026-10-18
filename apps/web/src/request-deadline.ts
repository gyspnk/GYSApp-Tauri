/** Bound the entire operation, including body decoding, and retire its transport. */
export async function withRequestDeadline<T>(
  request: (signal: AbortSignal) => Promise<T>,
  timeoutMs: number,
  callerSignal?: AbortSignal,
): Promise<T> {
  callerSignal?.throwIfAborted();
  const controller = new AbortController();
  let rejectDeadline!: (reason: unknown) => void;
  const cancelled = new Promise<never>((_resolve, reject) => {
    rejectDeadline = reject;
  });
  const cancel = (reason: unknown) => {
    controller.abort(reason);
    rejectDeadline(reason);
  };
  const onAbort = () => cancel(callerSignal?.reason);
  const timer = setTimeout(
    () =>
      cancel(new DOMException("Resource request timed out", "TimeoutError")),
    timeoutMs,
  );
  callerSignal?.addEventListener("abort", onAbort, { once: true });
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        controller.signal.throwIfAborted();
        return request(controller.signal);
      }),
      cancelled,
    ]);
  } finally {
    clearTimeout(timer);
    callerSignal?.removeEventListener("abort", onAbort);
    controller.abort();
  }
}
