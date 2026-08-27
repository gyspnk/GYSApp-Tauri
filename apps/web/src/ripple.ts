/**
 * Ripple feedback for clickable rows (gyschordweb setupRippleEffect parity).
 * Fire-and-forget: a span grows and fades from the click point.
 */
export function triggerRipple(
  element: HTMLElement | null | undefined,
  clientX: number,
  clientY: number,
): void {
  if (!element) return;
  element.classList.add("ripple-effect");
  const rect = element.getBoundingClientRect();
  const diameter = Math.max(element.clientWidth, element.clientHeight);
  const radius = diameter / 2;
  const ripple = document.createElement("span");
  ripple.className = "gys-ripple";
  ripple.style.width = `${diameter}px`;
  ripple.style.height = `${diameter}px`;
  ripple.style.left = `${clientX - rect.left - radius}px`;
  ripple.style.top = `${clientY - rect.top - radius}px`;
  element.appendChild(ripple);
  window.setTimeout(() => ripple.remove(), 600);
}
