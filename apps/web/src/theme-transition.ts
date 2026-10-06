import { flushSync } from "react-dom";

let pending: ViewTransition | undefined;
let generation = 0;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Supersede rapid changes; snapshots fade without moving the reading position. */
export function transitionTheme(update: () => void): void {
  const current = ++generation;
  pending?.skipTransition();
  clearTimeout(timer);
  const root = document.documentElement;
  root.classList.remove("is-theme-transition", "is-theme-color-transition");
  // Dropdown focus may leave a native smooth scroll running underneath the fade.
  window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
  const position = {
    left: scrollX,
    top: scrollY,
    behavior: "instant",
  } as const;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    update();
    return;
  }
  root.classList.add("is-theme-transition");
  const apply = () => {
    if (current === generation) {
      flushSync(update);
      // Cancel a compositor scroll frame already queued before the snapshot.
      window.scrollTo(position);
    }
  };
  const cleanup = () => {
    if (current === generation) {
      root.classList.remove("is-theme-transition", "is-theme-color-transition");
      pending = undefined;
    }
  };
  const fallback = () => {
    root.classList.add("is-theme-color-transition");
    apply();
    timer = setTimeout(cleanup, 280);
  };
  if (!document.startViewTransition) {
    fallback();
    return;
  }
  try {
    pending = document.startViewTransition(apply);
    pending.finished.catch(() => undefined).finally(cleanup);
  } catch {
    fallback();
  }
}
