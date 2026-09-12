import {
  canUseNativeEdgeTransport,
  synthesizeEdgeDirect as synthesizeEdgeDirectUnsafe,
  type EdgeSocket,
  type EdgeSocketMessage,
} from "./edge-direct.js";

export {
  canUseNativeEdgeTransport,
  type EdgeSocket,
  type EdgeSocketMessage,
};

const HARD_DEADLINE_MS = 30_000;

type DirectRequest = Parameters<typeof synthesizeEdgeDirectUnsafe>[0];
type DirectDependencies = Parameters<typeof synthesizeEdgeDirectUnsafe>[1];

function abortError(): Error {
  return new DOMException("Speech cancelled", "AbortError");
}

export function synthesizeEdgeDirect(
  request: DirectRequest,
  dependencies: DirectDependencies = {},
  signal?: AbortSignal,
): Promise<Blob> {
  if (signal?.aborted) return Promise.reject(abortError());

  const controller = new AbortController();
  return new Promise<Blob>((resolve, reject) => {
    let settled = false;
    let timedOut = false;

    const cleanup = () => {
      clearTimeout(timeout);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = (blob: Blob) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(blob);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(
        error instanceof Error
          ? error
          : new Error("Edge speech transport failed"),
      );
    };
    const onAbort = () => {
      controller.abort();
      fail(abortError());
    };
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
      fail(new Error("Edge speech transport timed out"));
    }, HARD_DEADLINE_MS);

    signal?.addEventListener("abort", onAbort, { once: true });
    void synthesizeEdgeDirectUnsafe(
      request,
      dependencies,
      controller.signal,
    ).then(finish, (error: unknown) => {
      if (timedOut) return;
      if (signal?.aborted) {
        fail(abortError());
        return;
      }
      fail(error);
    });
  });
}
