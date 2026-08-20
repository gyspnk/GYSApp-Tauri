/**
 * Mobile haptic feedback utility.
 * Triggers subtle vibration ticks on supported devices with graceful no-op fallback.
 */
export function hapticTick(type: "light" | "medium" | "hold" = "light"): void {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.vibrate !== "function"
  ) {
    return;
  }
  try {
    const pattern =
      type === "medium" ? 25 : type === "hold" ? [0, 60, 40, 60] : 10;
    navigator.vibrate(pattern);
  } catch {
    // Graceful no-op if vibration is blocked or unsupported by browser policy
  }
}
