import { flushSync } from "react-dom";

let pending: ViewTransition | undefined;
let generation = 0;

/** Snapshot both sides of navigation; rapid input supersedes the prior fade. */
export function transitionReader(
  update: () => void,
  scope: "page" | "lyrics" | "pdf" = "page",
  afterUpdate?: () => void,
): Promise<void> {
  const current = ++generation;
  pending?.skipTransition();
  const root = document.documentElement;
  const commit = () => {
    flushSync(update);
    afterUpdate?.();
  };
  if (
    !document.startViewTransition ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    root.classList.remove("is-reader-transition");
    delete root.dataset.readerTransition;
    pending = undefined;
    commit();
    return Promise.resolve();
  }
  root.classList.add("is-reader-transition");
  root.dataset.readerTransition = scope;
  const cleanup = () => {
    if (current === generation) {
      pending = undefined;
      root.classList.remove("is-reader-transition");
      delete root.dataset.readerTransition;
    }
  };
  try {
    const transition = document.startViewTransition(() => {
      if (current === generation) commit();
    });
    pending = transition;
    void transition.ready.catch(() => undefined);
    void transition.finished.catch(() => undefined).finally(cleanup);
    return transition.updateCallbackDone.catch(() => undefined);
  } catch {
    cleanup();
    commit();
    return Promise.resolve();
  }
}
