/**
 * Expressive yet serene Gereja Yesus Sejati sanctuary ambient backdrop.
 * Uses an inline SVG dove + sanctuary rays (never blocked like external <image>
 * inside SVG <img>) plus 10 GPU-composited floating light motes.
 * Automatically pauses all GPU animations when the window/tab is hidden.
 */
const GYS_DOVE_SVG = `<svg viewBox="0 0 220 220" fill="none" xmlns="http://www.w3.org/2000/svg">
  <circle cx="110" cy="110" r="98" stroke="currentColor" stroke-width="1.5" opacity="0.28" />
  <circle cx="110" cy="110" r="82" stroke="currentColor" stroke-width="1" stroke-dasharray="4 6" opacity="0.22" />
  <g class="ambient-dove-wing-left">
    <path d="M106 112C82 88 48 64 20 56C34 82 52 104 80 116C90 120 99 119 106 112Z" fill="currentColor" opacity="0.82" />
    <path d="M98 116C70 105 42 94 24 88C40 108 60 122 86 125C93 125 97 121 98 116Z" fill="currentColor" opacity="0.52" />
  </g>
  <g class="ambient-dove-wing-right">
    <path d="M114 112C138 88 172 64 200 56C186 82 168 104 140 116C130 120 121 119 114 112Z" fill="currentColor" opacity="0.92" />
    <path d="M122 116C150 105 178 94 196 88C180 108 160 122 134 125C127 125 123 121 122 116Z" fill="currentColor" opacity="0.58" />
  </g>
  <path d="M110 86C117 86 122 92 122 101C122 112 117 127 110 142C103 127 98 112 98 101C98 92 103 86 110 86Z" fill="currentColor" opacity="0.9" />
  <path d="M99 142L110 164L121 142C115 146 105 146 99 142Z" fill="currentColor" opacity="0.7" />
</svg>`;

export function installAmbientBackdrop(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const root = document.createElement("div");
  root.className = "gys-ambient-backdrop";
  root.setAttribute("aria-hidden", "true");

  const ray = document.createElement("div");
  ray.className = "gys-ambient-ray";

  const auraPrimary = document.createElement("div");
  auraPrimary.className = "gys-ambient-aura gys-ambient-aura-primary";

  const auraSecondary = document.createElement("div");
  auraSecondary.className = "gys-ambient-aura gys-ambient-aura-secondary";

  const motes = document.createElement("div");
  motes.className = "gys-ambient-motes";
  for (let i = 1; i <= 10; i += 1) {
    const mote = document.createElement("span");
    mote.className = `gys-ambient-mote gys-mote-${i}`;
    motes.appendChild(mote);
  }

  const emblem = document.createElement("div");
  emblem.className = "gys-ambient-emblem";
  emblem.innerHTML = GYS_DOVE_SVG;

  root.append(ray, auraPrimary, auraSecondary, motes, emblem);
  document.body.prepend(root);

  const syncVisibility = () => {
    document.documentElement.classList.toggle("is-tab-hidden", document.hidden);
  };
  syncVisibility();
  document.addEventListener("visibilitychange", syncVisibility);

  return () => {
    document.removeEventListener("visibilitychange", syncVisibility);
    document.documentElement.classList.remove("is-tab-hidden");
    root.remove();
  };
}
