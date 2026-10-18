const MIN_AUTOFIT_FONT_SIZE = 14;

/**
 * Hysteresis to prevent oscillation between two sizes on wrap.
 * Reader instances carry their own previous value via `lastFittedFontSize`.
 */

export type AutoFitFontSizeInput = {
  preferredFontSize: number;
  availableWidth: number;
  measuredWidth: number;
  /** Optional height bound (gyschordweb v9): a verse taller than the viewport
   * must shrink even when the widest line still fits horizontally. */
  availableHeight?: number;
  measuredHeight?: number;
  minFontSize?: number;
  /** Previous fitted size for anti-oscillation (gyschordweb v9) */
  lastFittedFontSize?: number;
};

/**
 * Return the largest readable font size that fits both the available width and
 * (when provided) the available height. The measurement is deliberately
 * conservative: the DOM layout effect can run again after the result is applied
 * when a chord marker wraps differently at the new size.
 *
 * Gyschordweb v9 anti-oscillation: when the measured size oscillates between
 * "fits" and "overflows" across two consecutive sizes, keep the smaller stable
 * size instead of bouncing. A 0.5px hysteresis band matches the original.
 */
export function autoFitFontSize({
  preferredFontSize,
  availableWidth,
  measuredWidth,
  availableHeight,
  measuredHeight,
  minFontSize = MIN_AUTOFIT_FONT_SIZE,
  lastFittedFontSize,
}: AutoFitFontSizeInput): number {
  const preferred = Number.isFinite(preferredFontSize) ? preferredFontSize : 18;
  const available = Number.isFinite(availableWidth) ? availableWidth : 0;
  const measured = Number.isFinite(measuredWidth) ? measuredWidth : 0;
  const minimum = Math.max(
    MIN_AUTOFIT_FONT_SIZE,
    Number.isFinite(minFontSize) ? minFontSize : MIN_AUTOFIT_FONT_SIZE,
  );
  let widthRatio = 1;
  if (available > 0 && measured > available) widthRatio = available / measured;
  let heightRatio = 1;
  if (
    Number.isFinite(availableHeight) &&
    Number.isFinite(measuredHeight) &&
    (availableHeight as number) > 0 &&
    (measuredHeight as number) > (availableHeight as number)
  ) {
    heightRatio = (availableHeight as number) / (measuredHeight as number);
  }
  const ratio = Math.min(widthRatio, heightRatio);
  if (preferred <= minimum || ratio >= 1) {
    return Math.max(minimum, preferred);
  }
  const candidate = Math.floor(preferred * ratio);
  const next = Math.max(minimum, Math.min(preferred, candidate));
  // Hysteresis: if we just fitted 16 and now candidate is 17, but last was 16,
  // keep 16 to avoid 16->17->16 loop when chord wraps at 17.
  const last = lastFittedFontSize;
  if (last && Math.abs(next - last) < 0.6 && next > last) {
    return last;
  }
  return next;
}

export { MIN_AUTOFIT_FONT_SIZE };

/** Measure an isolated preferred-size copy, without animated or previously fitted
 * geometry feeding back into the next fit. Rem units preserve device text scale. */
export function measureHymnFontFit(
  element: HTMLElement,
  preferred: number,
  availableHeight: number,
  lastFittedFontSize: number,
): number {
  const clone = element.cloneNode(true) as HTMLElement;
  clone.removeAttribute("id");
  clone.setAttribute("aria-hidden", "true");
  clone.inert = true;
  Object.assign(clone.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    visibility: "hidden",
    width: `${element.clientWidth}px`,
    height: "auto",
    minHeight: "0",
    maxHeight: "none",
    display: "block",
    overflow: "visible",
    fontSize: `${preferred / 16}rem`,
    margin: "0",
  });
  for (const node of [clone, ...clone.querySelectorAll<HTMLElement>("*")]) {
    node.style.setProperty("transition", "none", "important");
    node.style.setProperty("animation", "none", "important");
  }
  // Padding/line height reserves the chord lanes. Absolute overlay offsets
  // belong to the previous font and must not inflate this measurement.
  for (const row of clone.querySelectorAll<HTMLElement>(".chord-visual-row"))
    row.style.display = "none";
  element.parentElement!.append(clone);
  try {
    return autoFitFontSize({
      preferredFontSize: preferred,
      availableWidth: element.clientWidth,
      measuredWidth: clone.scrollWidth,
      availableHeight,
      measuredHeight: clone.scrollHeight,
      lastFittedFontSize,
    });
  } finally {
    clone.remove();
  }
}
