import { useLayoutEffect, type RefObject } from "react";

type Position = { x: number; y: number; width: number; height: number };

/** Animate stable words and chord markers from their previous visual position.
 * Layout settles first; transforms never participate in wrapping or fitting. */
export function useLyricReflow(
  ref: RefObject<HTMLElement | null>,
  identity: string,
) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    let previous = new Map<string, Position>();
    const animations = new Map<HTMLElement, Animation>();
    let frame = 0;
    const cancel = () => {
      for (const animation of animations.values()) animation.cancel();
      animations.clear();
    };
    const measure = () => {
      frame = 0;
      if (root.classList.contains("is-pinching") || motion.matches) {
        cancel();
        previous.clear();
        return;
      }
      const elements = Array.from(
        root.querySelectorAll<HTMLElement>("[data-reflow-key]"),
      );
      const origin = root.getBoundingClientRect();
      const position = (element: HTMLElement) => {
        const box = element.getBoundingClientRect();
        return {
          x: box.x - origin.x,
          y: box.y - origin.y,
          width: box.width,
          height: box.height,
        };
      };
      // Capture ongoing motion before cancelling, so another adjustment starts
      // where the user sees the word rather than at its previous destination.
      const visible = new Map(elements.map((el) => [el, position(el)]));
      const moving = new Set(animations.keys());
      cancel();
      const next = new Map<string, Position>();
      const pending: Array<{
        element: HTMLElement;
        before: Position;
        after: Position;
      }> = [];
      for (const element of elements) {
        const key = element.dataset.reflowKey!;
        const after = position(element);
        const old = previous.get(key);
        next.set(key, after);
        if (!old || !after.width || !after.height) continue;
        const before = moving.has(element) ? visible.get(element)! : old;
        if (
          Math.abs(before.x - after.x) > 0.5 ||
          Math.abs(before.y - after.y) > 0.5 ||
          Math.abs(before.width - after.width) > 0.5
        )
          pending.push({ element, before, after });
      }
      previous = next;
      for (const { element, before, after } of pending) {
        const animation = element.animate(
          [
            {
              transform: `translate(${before.x - after.x}px, ${before.y - after.y}px) scale(${before.width / after.width}, ${before.height / after.height})`,
            },
            { transform: "none" },
          ],
          { duration: 340, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
        animation.id = "gys-lyrics-reflow";
        animations.set(element, animation);
        void animation.finished
          .then(() => {
            if (animations.get(element) === animation)
              animations.delete(element);
          })
          .catch(() => {});
      }
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const resized = new ResizeObserver(schedule);
    resized.observe(root);
    const changed = new MutationObserver(schedule);
    changed.observe(root, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    motion.addEventListener("change", schedule);
    measure();
    return () => {
      resized.disconnect();
      changed.disconnect();
      motion.removeEventListener("change", schedule);
      cancelAnimationFrame(frame);
      cancel();
    };
  }, [ref, identity]);
}
