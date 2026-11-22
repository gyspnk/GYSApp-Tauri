/**
 * Ripple feedback for clickable surfaces and buttons.
 * Fire-and-forget: a radial liquid wave grows and fades from the press point.
 */
export function triggerElementRipple(
  element: HTMLElement | null | undefined,
  clientX: number,
  clientY: number,
): void {
  if (!element) return;
  if (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return;
  }
  element.classList.add("ripple-effect");
  const existing = element.querySelectorAll(":scope > .gys-ripple");
  if (existing.length >= 2) {
    existing[0]?.remove();
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;
  const diameter = Math.max(rect.width, rect.height, 44);
  const radius = diameter / 2;
  const ripple = document.createElement("span");
  ripple.className = "gys-ripple";
  ripple.style.width = `${diameter}px`;
  ripple.style.height = `${diameter}px`;
  ripple.style.left = `${clientX - rect.left - radius}px`;
  ripple.style.top = `${clientY - rect.top - radius}px`;
  element.appendChild(ripple);
  const cleanup = () => {
    if (ripple.isConnected) ripple.remove();
  };
  ripple.addEventListener("animationend", cleanup, { once: true });
  ripple.addEventListener("animationcancel", cleanup, { once: true });
  // Keep fallback longer than the 560ms keyframe so removal never aborts Web Animations `.finished`.
  window.setTimeout(cleanup, 900);
}

export function triggerRipple(
  element: HTMLElement | null | undefined,
  clientX: number,
  clientY: number,
): void {
  triggerElementRipple(element, clientX, clientY);
}
