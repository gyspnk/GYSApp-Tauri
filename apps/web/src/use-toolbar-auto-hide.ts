import { useEffect, useState, useRef, useCallback } from "react";

export function computeReadingToolbarVisibility(
  currentScrollY: number,
  lastScrollY: number,
  currentlyVisible: boolean,
): boolean {
  const delta = currentScrollY - lastScrollY;
  if (currentScrollY <= 40) return true;
  if (delta > 8 && currentScrollY > 80) return false;
  if (delta < -6) return true;
  return currentlyVisible;
}

/**
 * Hook to manage reading toolbar visibility / compaction based on scroll direction.
 * Auto-hides (or compacts) when scrolling down, restores when scrolling up or tapped.
 */
export function useReadingToolbarAutoHide() {
  const [toolbarVisible, setToolbarVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const onScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const currentScrollY =
          window.scrollY || document.documentElement.scrollTop || 0;
        setToolbarVisible((prev) =>
          computeReadingToolbarVisibility(
            currentScrollY,
            lastScrollY.current,
            prev,
          ),
        );
        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const restoreToolbar = useCallback(() => {
    setToolbarVisible(true);
  }, []);

  return { toolbarVisible, restoreToolbar };
}
