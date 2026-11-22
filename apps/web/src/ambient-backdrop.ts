/**
 * Passive, translucent Gereja Yesus Sejati sanctuary backdrop.
 * Mounted once outside React so route changes and state updates never re-render it.
 */
export function installAmbientBackdrop(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  const root = document.createElement("div");
  root.className = "gys-ambient-backdrop";
  root.setAttribute("aria-hidden", "true");

  const auraPrimary = document.createElement("div");
  auraPrimary.className = "gys-ambient-aura gys-ambient-aura-primary";

  const auraSecondary = document.createElement("div");
  auraSecondary.className = "gys-ambient-aura gys-ambient-aura-secondary";

  const emblem = document.createElement("div");
  emblem.className = "gys-ambient-emblem";

  const img = document.createElement("img");
  img.src = `${import.meta.env.BASE_URL}assets/gys-mark.svg`;
  img.alt = "";
  img.decoding = "async";
  img.loading = "lazy";
  emblem.appendChild(img);

  root.append(auraPrimary, auraSecondary, emblem);
  document.body.prepend(root);

  return () => {
    root.remove();
  };
}
