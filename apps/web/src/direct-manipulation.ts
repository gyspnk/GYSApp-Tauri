export type PdfZoomShortcut = "in" | "out" | "reset" | null;

export function resolvePdfZoomShortcut(
  event: Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey">,
): PdfZoomShortcut {
  if (!event.ctrlKey && !event.metaKey) return null;
  if (event.key === "+" || event.key === "=") return "in";
  if (event.key === "-" || event.key === "_") return "out";
  if (event.key === "0") return "reset";
  return null;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest(
      'input:not([type="button"]):not([type="submit"]), textarea, select, [contenteditable="true"]',
    ),
  );
}

function createZoomHud(stage: HTMLElement, value: string): HTMLElement {
  const existing = stage.querySelector<HTMLElement>(".pdf-zoom-hud");
  if (existing) return existing;
  const hud = document.createElement("div");
  hud.className = "pdf-zoom-hud";
  hud.setAttribute("role", "status");
  hud.setAttribute("aria-live", "polite");
  hud.setAttribute("aria-label", "Zoom PDF");
  hud.textContent = value;
  stage.append(hud);
  return hud;
}

function enhancePdfReader(reader: HTMLElement): void {
  if (reader.dataset.directManipulationReady === "true") return;

  const stage = reader.querySelector<HTMLElement>(".pdf-stage");
  const indicator = reader.querySelector<HTMLElement>(".pdf-zoom-indicator");
  const advancedToggle =
    reader.querySelector<HTMLButtonElement>(".pdf-advanced-toggle");
  if (!stage || !indicator || !advancedToggle) return;

  reader.dataset.directManipulationReady = "true";
  stage.dataset.directManipulationReady = "true";
  stage.tabIndex = 0;
  stage.setAttribute(
    "aria-keyshortcuts",
    "Control+= Meta+= Control+- Meta+- Control+0 Meta+0",
  );

  advancedToggle.setAttribute("aria-label", "Opsi PDF");
  advancedToggle.title = "Opsi PDF";
  if (advancedToggle.getAttribute("aria-expanded") === "true") {
    advancedToggle.click();
  }

  const hud = createZoomHud(stage, indicator.textContent?.trim() || "100%");
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

  stage.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) return;
    const action = resolvePdfZoomShortcut(event);
    if (!action) return;

    const control =
      action === "in"
        ? reader.querySelector<HTMLButtonElement>(
            '.pdf-zoom-controls button[aria-label="Perbesar zoom"]',
          )
        : action === "out"
          ? reader.querySelector<HTMLButtonElement>(
              '.pdf-zoom-controls button[aria-label="Perkecil zoom"]',
            )
          : reader.querySelector<HTMLButtonElement>(".pdf-zoom-reset");
    if (!control || control.disabled) return;

    event.preventDefault();
    control.click();
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
  observer.observe(document.documentElement, { childList: true, subtree: true });
  return () => observer.disconnect();
}
