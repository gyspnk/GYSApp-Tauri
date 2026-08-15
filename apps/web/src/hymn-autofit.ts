const MIN_AUTOFIT_FONT_SIZE = 14;

export type AutoFitFontSizeInput = {
  preferredFontSize: number;
  availableWidth: number;
  measuredWidth: number;
  minFontSize?: number;
};

/**
 * Return the largest readable font size that should fit a single-line
 * measurement.  The measurement is deliberately conservative: the DOM
 * layout effect can run again after the result is applied when a chord marker
 * wraps differently at the new size.
 */
export function autoFitFontSize({
  preferredFontSize,
  availableWidth,
  measuredWidth,
  minFontSize = MIN_AUTOFIT_FONT_SIZE,
}: AutoFitFontSizeInput): number {
  const preferred = Number.isFinite(preferredFontSize) ? preferredFontSize : 18;
  const available = Number.isFinite(availableWidth) ? availableWidth : 0;
  const measured = Number.isFinite(measuredWidth) ? measuredWidth : 0;
  const minimum = Math.max(
    MIN_AUTOFIT_FONT_SIZE,
    Number.isFinite(minFontSize) ? minFontSize : MIN_AUTOFIT_FONT_SIZE,
  );
  if (preferred <= minimum || available <= 0 || measured <= available)
    return Math.max(minimum, preferred);
  const ratio = available / measured;
  const candidate = Math.floor(preferred * ratio);
  return Math.max(minimum, Math.min(preferred, candidate));
}

export { MIN_AUTOFIT_FONT_SIZE };
