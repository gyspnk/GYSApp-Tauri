/**
 * Expressive yet serene Gereja Yesus Sejati sanctuary ambient backdrop.
 * Uses the official GYS Dove emblem cropped cleanly (3:2) from assets/gys-logo.png
 * plus 10 GPU-composited floating light motes and soft sanctuary rays.
 * Automatically pauses all GPU animations when the window/tab is hidden.
 */
export function installAmbientBackdrop(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const base = import.meta.env.BASE_URL || "/";
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
  const img = document.createElement("img");
  img.src = `${base}assets/gys-logo.png`;
  img.alt = "";
  img.decoding = "async";
  emblem.appendChild(img);

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
