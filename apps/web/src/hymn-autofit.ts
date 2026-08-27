const MIN_AUTOFIT_FONT_SIZE = 14;

/** Hysteresis to prevent oscillation between two sizes on wrap */
let _lastFitPx = 0;

export type AutoFitFontSizeInput = {
  preferredFontSize: number;
  availableWidth: number;
  measuredWidth: number;
  minFontSize?: number;
  /** Previous fitted size for anti-oscillation (gyschordweb v9) */
  lastFittedFontSize?: number;
};

/**
 * Return the largest readable font size that should fit a single-line
 * measurement.  The measurement is deliberately conservative: the DOM
 * layout effect can run again after the result is applied when a chord marker
 * wraps differently at the new size.
 *
 * Gyschordweb v9 anti-oscillation: when the measured width oscillates between
 * "fits" and "overflows" across two consecutive sizes, keep the smaller stable
 * size instead of bouncing.  A 0.5px hysteresis band matches the original.
 */
export function autoFitFontSize({
  preferredFontSize,
  availableWidth,
  measuredWidth,
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
  if (preferred <= minimum || available <= 0 || measured <= available) {
    _lastFitPx = Math.max(minimum, preferred);
    return _lastFitPx;
  }
  const ratio = available / measured;
  const candidate = Math.floor(preferred * ratio);
  const next = Math.max(minimum, Math.min(preferred, candidate));
  // Hysteresis: if we just fitted 16 and now candidate is 17, but last was 16,
  // keep 16 to avoid 16->17->16 loop when chord wraps at 17.
  const last = lastFittedFontSize ?? _lastFitPx;
  if (last && Math.abs(next - last) < 0.6 && next > last) {
    return last;
  }
  _lastFitPx = next;
  return next;
}

/** Exposed for testing hysteresis boundary */
export function _resetAutoFitHysteresis(): void {
  _lastFitPx = 0;
}

export { MIN_AUTOFIT_FONT_SIZE };
