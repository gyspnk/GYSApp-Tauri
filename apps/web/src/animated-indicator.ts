import { useLayoutEffect, useRef } from "react";

/** Native, interruptible motion; resize follows the layout without animation. */
export function useAnimatedIndicator(
  active: string | boolean,
  selector: string,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const initialized = useRef(false);
  const animationRef = useRef<Animation | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;
    const update = (animate: boolean) => {
      const selected = container.querySelector<HTMLElement>(selector);
      if (!selected) return;
      const box = selected.getBoundingClientRect();
      const parent = container.getBoundingClientRect();
      const current = getComputedStyle(indicator);
      const from = {
        transform: current.transform,
        width: current.width,
        height: current.height,
      };
      animationRef.current?.cancel();
      const target = {
        transform: `translate(${box.left - parent.left - container.clientLeft}px, ${box.top - parent.top - container.clientTop}px)`,
        width: `${box.width}px`,
        height: `${box.height}px`,
      };
      Object.assign(indicator.style, target);
      if (
        animate &&
        initialized.current &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        animationRef.current = indicator.animate([from, target], {
          duration: 280,
          easing: "cubic-bezier(.22, 1, .36, 1)",
        });
      }
      initialized.current = true;
    };
    update(true);
    let firstObservation = true;
    const observer = new ResizeObserver(() => {
      if (firstObservation) firstObservation = false;
      else update(false);
    });
    observer.observe(container);
    container
      .querySelectorAll(selector)
      .forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [active, selector]);

  useLayoutEffect(() => () => animationRef.current?.cancel(), []);
  return { containerRef, indicatorRef };
}
