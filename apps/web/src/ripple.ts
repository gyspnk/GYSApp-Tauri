/**
 * Liquid water ripple & micro-droplet particle feedback for clickable surfaces.
 * Fire-and-forget GPU-composited animations (transform + opacity only);
 * automatically skipped when prefers-reduced-motion: reduce is active.
 */
const DROP_ANGLES_DEG = [-145, -88, -32, 24, 96, 152];

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
  const existing = element.querySelectorAll(
    ":scope > .gys-ripple, :scope > .gys-ripple-ring",
  );
  if (existing.length >= 4) {
    existing[0]?.remove();
    existing[1]?.remove();
  }
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  const diameter = Math.max(rect.width, rect.height, 48);
  const radius = diameter / 2;

  const ripple = document.createElement("span");
  ripple.className = "gys-ripple";
  ripple.style.width = `${diameter}px`;
  ripple.style.height = `${diameter}px`;
  ripple.style.left = `${localX - radius}px`;
  ripple.style.top = `${localY - radius}px`;

  const ring = document.createElement("span");
  ring.className = "gys-ripple-ring";
  const ringSize = Math.min(diameter * 0.72, 120);
  ring.style.width = `${ringSize}px`;
  ring.style.height = `${ringSize}px`;
  ring.style.left = `${localX - ringSize / 2}px`;
  ring.style.top = `${localY - ringSize / 2}px`;

  const fragment = document.createDocumentFragment();
  fragment.append(ripple, ring);

  const drops: HTMLSpanElement[] = [];
  const baseRadius = Math.min(Math.max(rect.width * 0.16, 22), 46);
  for (let i = 0; i < DROP_ANGLES_DEG.length; i += 1) {
    const jitter = ((i * 19) % 15) - 7;
    const rad = (((DROP_ANGLES_DEG[i] ?? 0) + jitter) * Math.PI) / 180;
    const dist = baseRadius * (0.78 + (i % 3) * 0.22);
    const drop = document.createElement("span");
    drop.className = "gys-water-drop";
    const size = i % 2 === 0 ? 6 : 4;
    drop.style.width = `${size}px`;
    drop.style.height = `${size}px`;
    drop.style.left = `${localX - size / 2}px`;
    drop.style.top = `${localY - size / 2}px`;
    drop.style.setProperty("--drop-x", `${Math.round(Math.cos(rad) * dist)}px`);
    drop.style.setProperty("--drop-y", `${Math.round(Math.sin(rad) * dist)}px`);
    drop.style.animationDelay = `${(i % 3) * 24}ms`;
    drops.push(drop);
    fragment.appendChild(drop);
  }

  element.appendChild(fragment);

  const cleanup = () => {
    if (ripple.isConnected) ripple.remove();
    if (ring.isConnected) ring.remove();
    for (const drop of drops) {
      if (drop.isConnected) drop.remove();
    }
  };
  ripple.addEventListener("animationend", cleanup, { once: true });
  ripple.addEventListener("animationcancel", cleanup, { once: true });
  window.setTimeout(cleanup, 900);
}

export const triggerRipple = triggerElementRipple;
