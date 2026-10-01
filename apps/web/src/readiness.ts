import { useLayoutEffect } from "react";

/** A rendered frame, distinct from host polling and provider/audio readiness. */
export function useReadinessMarker(
  name: string,
  ready = true,
  revision?: unknown,
): void {
  useLayoutEffect(() => {
    if (!ready) return;
    const frame = requestAnimationFrame(() => {
      performance.clearMarks(name);
      performance.mark(name);
    });
    return () => cancelAnimationFrame(frame);
  }, [name, ready, revision]);
}
