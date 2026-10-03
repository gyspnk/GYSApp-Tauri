import { flushSync } from "react-dom";

let pending: ViewTransition | undefined;

/** Snapshot both sides of navigation; rapid input supersedes the prior fade. */
export function transitionReader(update: () => void): void {
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }
  pending?.skipTransition();
  const transition = document.startViewTransition(() => flushSync(update));
  pending = transition;
  transition.finished
    .catch(() => undefined)
    .finally(() => {
      if (pending === transition) pending = undefined;
    });
}
