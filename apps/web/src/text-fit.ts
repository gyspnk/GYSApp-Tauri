/**
 * Single-line text auto-fit (gyschordweb `autoFitTextSingleLine`).
 * Binary-search the largest font size in [minPx, maxPx] that fits the
 * element width; caches state per element to avoid layout thrash and
 * re-measures when the web font finishes loading.
 */

type FitState = {
  width: number;
  text: string;
  maxPx: number;
  minPx: number;
  appliedPx: number;
};

const stateCache = new WeakMap<HTMLElement, FitState>();

/** Force one line, then binary-search a fitting font size. */
export function autoFitTextSingleLine(
  element: HTMLElement | null | undefined,
  options: { maxPx: number; minPx: number } = { maxPx: 16, minPx: 10 },
): void {
  if (!element) return;
  element.style.whiteSpace = "nowrap";
  element.style.overflow = "hidden";
  element.style.textOverflow = "ellipsis";

  const width = Math.round(element.clientWidth);
  if (width <= 0) return;

  const text = element.textContent || "";
  const previous = stateCache.get(element);
  if (
    previous &&
    previous.width === width &&
    previous.text === text &&
    previous.maxPx === options.maxPx &&
    previous.minPx === options.minPx
  ) {
    element.style.fontSize = `${previous.appliedPx}px`;
    if (element.scrollWidth <= width + 1) return;
  }

  element.style.fontSize = `${options.maxPx}px`;
  if (element.scrollWidth <= width + 1) {
    stateCache.set(element, {
      width,
      text,
      ...options,
      appliedPx: options.maxPx,
    });
    return;
  }

  let lo = options.minPx;
  let hi = options.maxPx;
  while (hi - lo > 0.5) {
    const mid = (lo + hi) / 2;
    element.style.fontSize = `${mid}px`;
    if (element.scrollWidth > width + 1) hi = mid;
    else lo = mid;
  }
  const appliedPx = Math.max(options.minPx, lo);
  element.style.fontSize = `${appliedPx}px`;
  stateCache.set(element, { width, text, ...options, appliedPx });
}

/**
 * Fit every matching element inside a container and refit when fonts load or
 * the container width changes (gyschordweb fitListTitles/fitViewerTitle).
 * Returns a cleanup function.
 */
export function observeSingleLineFit(
  container: HTMLElement | null | undefined,
  selector: string,
  options: { maxPx: number; minPx: number } = { maxPx: 16, minPx: 10 },
  extraDeps: unknown[] = [],
): () => void {
  if (!container) return () => undefined;

  const run = () => {
    container
      .querySelectorAll(selector)
      .forEach((element) =>
        autoFitTextSingleLine(element as HTMLElement, options),
      );
  };

  run();
  let raf = 0;
  let resizeRaf = 0;
  let lastWidth = Math.round(container.clientWidth);
  const scheduleRun = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(run);
  };
  const onResize = (entries: ResizeObserverEntry[]) => {
    const entry =
      entries.find((candidate) => candidate.target === container) ?? entries[0];
    const width = Math.round(entry?.contentRect.width ?? container.clientWidth);
    if (width === lastWidth) return;
    lastWidth = width;
    cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(run);
  };

  let fontCleanup: (() => void) | undefined;
  if (typeof document !== "undefined" && document.fonts) {
    void document.fonts.ready.then(scheduleRun);
    const onLoadingDone = () => scheduleRun();
    document.fonts.addEventListener(
      "loadingdone",
      onLoadingDone as EventListener,
    );
    fontCleanup = () =>
      document.fonts.removeEventListener(
        "loadingdone",
        onLoadingDone as EventListener,
      );
  }

  const observer =
    typeof ResizeObserver === "function" ? new ResizeObserver(onResize) : null;
  observer?.observe(container);

  return () => {
    cancelAnimationFrame(raf);
    cancelAnimationFrame(resizeRaf);
    observer?.disconnect();
    fontCleanup?.();
    void extraDeps;
  };
}
