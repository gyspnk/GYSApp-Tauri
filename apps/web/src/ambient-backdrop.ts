/**
 * Expressive yet serene Gereja Yesus Sejati sanctuary ambient backdrop.
 * Renders the authentic traced 6-path official GYS Dove SVG in the background
 * with slow passive wing-flapping colored dynamically by the app's active accent
 * (`var(--blue)` / `var(--gold)`), plus soft living-water rings, 10 floating
 * sanctuary motes, desktop cursor-following luminous aura, and gentle touch halo.
 * Automatically pauses all GPU animations when the window/tab is hidden or when
 * prefers-reduced-motion: reduce is active.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

const GYS_DOVE_PATHS: ReadonlyArray<{ className: string; d: string }> = [
  {
    className: "gys-ambient-arc gys-ambient-arc-1",
    d: "M0 126L10 155L28 189L49 218L74 244L64 238L40 219L28 207L13 187L5 170L1 156Z",
  },
  {
    className: "gys-ambient-arc gys-ambient-arc-2",
    d: "M29 92L32 104L43 134L52 152L68 178L98 216L129 247L138 254L115 242L86 222L65 203L50 185L35 158L29 139L27 127L27 104Z",
  },
  {
    className: "gys-ambient-arc gys-ambient-arc-3",
    d: "M57 37L66 77L75 104L83 123L102 159L118 183L140 210L164 234L192 256L177 248L159 236L124 208L97 180L78 154L63 124L55 96L54 81L53 80L53 62Z",
  },
  {
    className: "gys-ambient-wing-far",
    d: "M413 0L430 0L412 13L392 33L384 44L377 58L375 67L364 56L352 52L332 53L312 60L336 35L360 18L381 8L393 4Z",
  },
  {
    className: "gys-ambient-dove-body",
    d: "M345 73L358 74L368 77L381 86L389 98L391 105L391 111L395 118L396 123L387 119L375 116L366 117L362 119L357 124L346 140L333 153L315 164L301 169L283 173L237 175L228 180L219 189L215 196L213 196L205 190L229 173L232 170L231 169L196 184L162 164L191 147L231 134L233 131L228 125L229 124L307 77L329 75L330 74L344 74Z",
  },
  {
    className: "gys-ambient-wing-near",
    d: "M171 38L205 39L244 46L265 53L284 62Q295 70 298 86C304 106 300 130 284 146C268 158 248 154 238 142L230 127L216 109L192 85L178 74L164 65L150 58L136 53L117 49L121 46L131 43L147 40L170 39Z",
  },
];

function createOfficialDoveSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "gys-ambient-dove-svg");
  svg.setAttribute("viewBox", "0 0 432 265");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  for (const part of GYS_DOVE_PATHS) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("class", part.className);
    path.setAttribute("d", part.d);
    svg.appendChild(path);
  }
  return svg;
}

export function installAmbientBackdrop(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)");

  const root = document.createElement("div");
  root.className = "gys-ambient-backdrop";
  root.setAttribute("aria-hidden", "true");

  const ray = document.createElement("div");
  ray.className = "gys-ambient-ray";

  const auraPrimary = document.createElement("div");
  auraPrimary.className = "gys-ambient-aura gys-ambient-aura-primary";

  const auraSecondary = document.createElement("div");
  auraSecondary.className = "gys-ambient-aura gys-ambient-aura-secondary";

  const waterRings = document.createElement("div");
  waterRings.className = "gys-ambient-water-rings";
  const ringOne = document.createElement("span");
  ringOne.className = "gys-ambient-water-ring gys-water-ring-1";
  const ringTwo = document.createElement("span");
  ringTwo.className = "gys-ambient-water-ring gys-water-ring-2";
  waterRings.append(ringOne, ringTwo);

  const motes = document.createElement("div");
  motes.className = "gys-ambient-motes";
  for (let i = 1; i <= 10; i += 1) {
    const mote = document.createElement("span");
    mote.className = `gys-ambient-mote gys-mote-${i}`;
    motes.appendChild(mote);
  }

  const cursorGlow = document.createElement("div");
  cursorGlow.className = "gys-ambient-cursor-glow";

  const touchLayer = document.createElement("div");
  touchLayer.className = "gys-ambient-touch-layer";

  const emblem = document.createElement("div");
  emblem.className = "gys-ambient-emblem";
  emblem.appendChild(createOfficialDoveSvg());

  root.append(
    ray,
    auraPrimary,
    auraSecondary,
    waterRings,
    motes,
    cursorGlow,
    touchLayer,
    emblem,
  );
  document.body.prepend(root);

  let rafId = 0;
  let targetX = -999;
  let targetY = -999;
  let glowActive = false;

  const commitCursorGlow = () => {
    rafId = 0;
    cursorGlow.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`;
    if (!glowActive) {
      glowActive = true;
      cursorGlow.classList.add("is-active");
    }
  };

  const onPointerMove = (event: PointerEvent) => {
    if (
      reduced.matches ||
      document.hidden ||
      !finePointer.matches ||
      event.pointerType !== "mouse"
    ) {
      return;
    }
    targetX = event.clientX;
    targetY = event.clientY;
    if (!rafId) {
      rafId = window.requestAnimationFrame(commitCursorGlow);
    }
  };

  const onPointerLeave = () => {
    if (!glowActive) return;
    glowActive = false;
    cursorGlow.classList.remove("is-active");
  };

  const onPointerDown = (event: PointerEvent) => {
    if (reduced.matches || document.hidden || event.button > 0) return;
    if (touchLayer.childElementCount >= 3) {
      touchLayer.firstElementChild?.remove();
    }
    const halo = document.createElement("span");
    halo.className = "gys-ambient-touch-halo";
    halo.style.left = `${event.clientX}px`;
    halo.style.top = `${event.clientY}px`;
    touchLayer.appendChild(halo);
    const removeHalo = () => {
      if (halo.isConnected) halo.remove();
    };
    halo.addEventListener("animationend", removeHalo, { once: true });
    halo.addEventListener("animationcancel", removeHalo, { once: true });
    window.setTimeout(removeHalo, 950);
  };

  const syncVisibility = () => {
    document.documentElement.classList.toggle("is-tab-hidden", document.hidden);
    if (document.hidden) onPointerLeave();
  };
  syncVisibility();
  document.addEventListener("visibilitychange", syncVisibility);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });

  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    document.removeEventListener("visibilitychange", syncVisibility);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerdown", onPointerDown);
    document.documentElement.removeEventListener(
      "pointerleave",
      onPointerLeave,
    );
    document.documentElement.classList.remove("is-tab-hidden");
    root.remove();
  };
}
