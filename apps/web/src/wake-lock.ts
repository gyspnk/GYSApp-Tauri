import { useEffect, useRef } from "react";
import { recordDiagnostic } from "./diagnostics.js";

export type WakeLockSentinelLike = {
  release: () => Promise<void>;
};

export function isReadingRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/bible") ||
    pathname.startsWith("/kidung") ||
    pathname.startsWith("/literatur") ||
    pathname.startsWith("/literature") ||
    pathname.startsWith("/pdf")
  );
}

/**
 * React hook to manage Screen Wake Lock based on active reading route or active audio playback.
 * Automatically acquires wake lock when entering a reading route or starting audio,
 * re-acquires on tab visibility restore, and cleanly releases when leaving or hidden.
 */
export function useScreenWakeLock(
  pathname: string,
  isAudioPlaying: boolean,
): void {
  const activeSentinel = useRef<WakeLockSentinelLike | undefined>(undefined);
  const shouldLock = isReadingRoute(pathname) || isAudioPlaying;

  useEffect(() => {
    let cancelled = false;

    const nav =
      typeof navigator !== "undefined"
        ? (navigator as Navigator & {
            wakeLock?: {
              request: (type: "screen") => Promise<WakeLockSentinelLike>;
            };
          })
        : undefined;

    const acquire = async () => {
      if (!nav?.wakeLock || typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      try {
        const sentinel = await nav.wakeLock.request("screen");
        if (cancelled) {
          void sentinel.release().catch(() => undefined);
        } else {
          activeSentinel.current = sentinel;
        }
      } catch (error) {
        recordDiagnostic("warn", "wakeLock.request", error);
      }
    };

    const release = async () => {
      const current = activeSentinel.current;
      activeSentinel.current = undefined;
      if (current) {
        try {
          await current.release();
        } catch {
          // Ignore release failures
        }
      }
    };

    if (shouldLock) {
      void acquire();
    } else {
      void release();
    }

    const onVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState === "visible" && shouldLock) {
        void acquire();
      } else if (document.visibilityState === "hidden") {
        activeSentinel.current = undefined;
      }
    };

    document?.addEventListener?.("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      document?.removeEventListener?.("visibilitychange", onVisibilityChange);
      void release();
    };
  }, [pathname, isAudioPlaying, shouldLock]);
}
