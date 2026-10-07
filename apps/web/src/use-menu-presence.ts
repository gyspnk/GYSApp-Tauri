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
    const animations = ref.current?.getAnimations() ?? [];
    if (!animations.length) setPresent(false);
    else {
      void Promise.allSettled(
        animations.map((animation) => animation.finished),
      ).then(() => {
        if (current) setPresent(false);
      });
    }
    return () => {
      current = false;
    };
  }, [open, ref]);
  return open || present;
}
