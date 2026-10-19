import { useLayoutEffect, useState, type RefObject } from "react";

/** Keep a closing menu mounted until its CSS motion finishes. CSS also owns
 * reversal, positioning and reduced motion; no timers or animation replay. */
export function useMenuPresence(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
): boolean {
  const [present, setPresent] = useState(open);
  useLayoutEffect(() => {
    if (open) {
      setPresent(true);
      return;
    }
    let current = true;
    const finish = () => {
      if (current) setPresent(false);
    };
    // Closed styles (and their transitions) only exist after the next style
    // resolution, so reading animations in the layout effect raced the CSS and
    // dropped the exit motion on some renders.
    const frame = requestAnimationFrame(() => {
      const animations = ref.current?.getAnimations?.() ?? [];
      if (!animations.length) {
        finish();
        return;
      }
      void Promise.allSettled(
        animations.map((animation) => animation.finished),
      ).then(finish);
    });
    return () => {
      current = false;
      cancelAnimationFrame(frame);
    };
  }, [open, ref]);
  return open || present;
}
