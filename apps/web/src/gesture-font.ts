import { useEffect, useRef, type RefObject } from "react";

/** Gesture previews own only the DOM style. React and storage commit on release. */
export function useGestureFont(element: RefObject<HTMLElement | null>) {
  const frame = useRef(0);
  const pending = useRef<number | undefined>(undefined);
  const cancel = () => {
    if (frame.current) cancelAnimationFrame(frame.current);
    frame.current = 0;
    pending.current = undefined;
  };
  useEffect(() => cancel, []);
  return {
    queue(size: number) {
      pending.current = size;
      if (frame.current) return;
      frame.current = requestAnimationFrame(() => {
        frame.current = 0;
        if (element.current && pending.current !== undefined)
          element.current.style.fontSize = `${pending.current / 16}rem`;
      });
    },
    finish() {
      const size = pending.current;
      if (element.current && size !== undefined)
        element.current.style.fontSize = `${size / 16}rem`;
      cancel();
      return size;
    },
    cancel,
  };
}
