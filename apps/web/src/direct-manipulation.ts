import { translate, type Locale } from "./i18n.js";

function createZoomHud(
  stage: HTMLElement,
  value: string,
  locale: Locale,
): HTMLElement {
  const existing = stage.querySelector<HTMLElement>(".pdf-zoom-hud");
  if (existing) return existing;
  const hud = document.createElement("div");
  hud.className = "pdf-zoom-hud";
  hud.setAttribute("role", "status");
  hud.setAttribute("aria-live", "polite");
  hud.setAttribute("aria-label", translate(locale, "pdf.zoomGroup"));
  hud.textContent = value;
  stage.append(hud);
  return hud;
}

function enhancePdfReader(reader: HTMLElement): void {
  if (reader.dataset.directManipulationReady === "true") return;

  const stage = reader.querySelector<HTMLElement>(".pdf-stage");
  const indicator = reader.querySelector<HTMLElement>(".pdf-zoom-indicator");
  const advancedToggle = reader.querySelector<HTMLButtonElement>(
    ".pdf-advanced-toggle",
  );
  const zoomIn = reader.querySelector<HTMLButtonElement>(
    ".pdf-zoom-controls button:nth-child(3)",
  );
  const zoomOut = reader.querySelector<HTMLButtonElement>(
    ".pdf-zoom-controls button:first-child",
  );
  const zoomReset = reader.querySelector<HTMLButtonElement>(".pdf-zoom-reset");
  if (
    !stage ||
    !indicator ||
    !advancedToggle ||
    !zoomIn ||
    !zoomOut ||
    !zoomReset
  )
    return;

  reader.dataset.directManipulationReady = "true";
  stage.dataset.directManipulationReady = "true";
  stage.tabIndex = 0;
  stage.setAttribute(
    "aria-keyshortcuts",
    "Control+= Meta+= Control+- Meta+- Control+0 Meta+0",
  );

  const locale: Locale =
    reader.dataset.pdfLocale === "en"
      ? "en"
      : reader.dataset.pdfLocale === "zh"
        ? "zh"
        : "id";
  if (advancedToggle.getAttribute("aria-expanded") === "true") {
    advancedToggle.click();
  }

  const hud = createZoomHud(
    stage,
    indicator.textContent?.trim() || "100%",
    locale,
  );
  let hideHudTimer: number | undefined;
  const showZoomHud = () => {
    hud.textContent = indicator.textContent?.trim() || "100%";
    hud.classList.add("is-visible");
    if (hideHudTimer !== undefined) window.clearTimeout(hideHudTimer);
    hideHudTimer = window.setTimeout(() => {
      hud.classList.remove("is-visible");
    }, 900);
  };

  const zoomObserver = new MutationObserver(showZoomHud);
  zoomObserver.observe(indicator, {
    childList: true,
    characterData: true,
    subtree: true,
  });

  stage.addEventListener("pointerdown", (event) => {
    const target = event.target;
    if (
      target instanceof Element &&
      target.closest("button, a, input, select, textarea, [contenteditable]")
    )
      return;
    stage.focus({ preventScroll: true });
  });

  // pdf.tsx already owns Ctrl/Cmd +/- globally. Keep that canonical handler
  // single-owned; this layer only adds the missing reset shortcut.
  stage.addEventListener("keydown", (event) => {
    if ((!event.ctrlKey && !event.metaKey) || event.key !== "0") return;
    if (zoomReset.disabled) return;
    event.preventDefault();
    zoomReset.click();
    window.requestAnimationFrame(showZoomHud);
  });
}

export function installDirectManipulationEnhancements(): () => void {
  if (typeof document === "undefined") return () => undefined;

  const enhance = () => {
    document
      .querySelectorAll<HTMLElement>(".pdf-reader-hymn")
      .forEach(enhancePdfReader);
  };

  enhance();
  const observer = new MutationObserver(enhance);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  return () => observer.disconnect();
}
