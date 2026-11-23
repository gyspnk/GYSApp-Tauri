import { triggerElementRipple } from "./ripple.js";

const RIPPLE_SELECTOR =
  ".primary-button, .secondary-button, .quiet-button, .danger-button, .icon-button, .text-button, .home-portal, .more-library-link, .more-setting-row, .continue-item, .nav-item, .topbar-appearance-button, .account-button, .search-trigger, .accent-palette-item, .audio-setting-preview, .kidung-rail-row, .kidung-rail-toggle, .kidung-rail-expand-btn, .viewer-chrome-button, .hymn-action, .hymn-partitur-toggle, .hymn-more-actions-summary, .pdf-music-summary, .kidung-mode-cycle, .add-to-playlist-btn, .control-select-trigger, .control-select-option, .reader-context-button, .reader-context-book-picker, .lyrics-hdr-btn, .lyrics-ctrl-btn, .egys-provider, .pujian-title, .kidung-playlist-song, .kidung-queue-transport-btn, .kidung-queue-chip, .kidung-queue-quickadd-btn, .hamburger-item, .hamburger-drawer-close, .typography-step-btn, .faith-row-item, .literature-row, .suara-library-item";

const SURFACE_PRESS_SELECTOR =
  ".home-portal, .more-library-link, .more-setting-row, .continue-item, .kidung-rail-row, .pujian-title, .literature-row, .suara-library-item, .faith-row-item, .kidung-playlist-song, .kidung-saved-playlist-row, .hamburger-item";

const SPOTLIGHT_SELECTOR =
  ".home-portal, .more-library-link, .continue-item, .primary-button, .pujian-item, .kidung-playlist-list > li, .kidung-saved-playlist-row, .kidung-queue-hero, .more-setting-row, .literature-row, .suara-library-item, .faith-row-item, .hamburger-item";

const DISMISSABLE_DETAILS_SELECTOR =
  ".hymn-more-actions[open], .hymn-reader-settings[open], .media-advanced-controls[open], .pdf-music-menu[open], .faith-pdf-sources[open], .kidung-row-menu[open]";

/**
 * Delegated tactile motion engine: spring press/release feedback, radial press
 * ripples, and fine-pointer surface spotlight without per-button listeners.
 */
export function installControlMotion(): () => void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)");
  const running = new Map<HTMLElement, Animation>();
  const pressed = new Set<HTMLElement>();
  let spotlightRaf = 0;
  let pendingSpotlight: { el: HTMLElement; x: number; y: number } | null = null;

  document.documentElement.classList.add("has-control-motion");

  const control = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>("button:not(:disabled), a[href], summary")
      : null;

  const animatePress = (element: HTMLElement, isRelease: boolean) => {
    const isSurface = element.matches(SURFACE_PRESS_SELECTOR);
    const downScale = isSurface ? "0.985" : "0.955";
    const popScale = isSurface ? "1.006" : "1.022";
    running.get(element)?.cancel();
    const keyframes = isRelease
      ? [
          { scale: downScale },
          { scale: popScale, offset: 0.56 },
          { scale: "1" },
        ]
      : [{ scale: "1" }, { scale: downScale }];
    const animation = element.animate(keyframes, {
      duration: isRelease ? 280 : 95,
      easing: isRelease
        ? "cubic-bezier(0.22, 1, 0.36, 1)"
        : "cubic-bezier(0.2, 0, 0, 1)",
      fill: isRelease ? "none" : "forwards",
    });
    running.set(element, animation);
    if (isRelease) animation.onfinish = () => running.delete(element);
  };

  const press = (event: PointerEvent | KeyboardEvent) => {
    if (
      reduced.matches ||
      (event instanceof PointerEvent && event.button !== 0)
    )
      return;
    if (
      event instanceof KeyboardEvent &&
      (event.repeat || !["Enter", " "].includes(event.key))
    )
      return;
    const element = control(event.target);
    if (!element) return;
    pressed.add(element);
    animatePress(element, false);
    if (event instanceof PointerEvent && element.matches(RIPPLE_SELECTOR)) {
      triggerElementRipple(element, event.clientX, event.clientY);
    }
  };

  const release = () => {
    pressed.forEach((element) => {
      if (element.isConnected && !reduced.matches) animatePress(element, true);
      else {
        running.get(element)?.cancel();
        running.delete(element);
      }
    });
    pressed.clear();
  };

  const onPointerMove = (event: PointerEvent) => {
    if (
      reduced.matches ||
      !finePointer.matches ||
      event.pointerType !== "mouse"
    )
      return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(SPOTLIGHT_SELECTOR)
        : null;
    if (!target) return;
    pendingSpotlight = { el: target, x: event.clientX, y: event.clientY };
    if (spotlightRaf) return;
    spotlightRaf = window.requestAnimationFrame(() => {
      spotlightRaf = 0;
      const item = pendingSpotlight;
      pendingSpotlight = null;
      if (!item || !item.el.isConnected) return;
      const rect = item.el.getBoundingClientRect();
      item.el.style.setProperty("--pointer-x", `${item.x - rect.left}px`);
      item.el.style.setProperty("--pointer-y", `${item.y - rect.top}px`);
    });
  };

  const syncDisclosure = (details: HTMLDetailsElement) => {
    for (const child of details.children) {
      if (child.tagName === "SUMMARY") continue;
      if (child instanceof HTMLElement) child.inert = !details.open;
    }
  };

  const toggle = (event: Event) => {
    if (event.target instanceof HTMLDetailsElement)
      syncDisclosure(event.target);
  };

  const activateDisclosure = (event: MouseEvent) => {
    const summary =
      event.target instanceof Element ? event.target.closest("summary") : null;
    const details = summary?.parentElement;
    if (!(details instanceof HTMLDetailsElement)) return;
    queueMicrotask(() => syncDisclosure(details));
  };

  const dismiss = (event: PointerEvent | KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const escape = event instanceof KeyboardEvent && event.key === "Escape";
    if (event instanceof KeyboardEvent && !escape) return;
    document
      .querySelectorAll<HTMLDetailsElement>(DISMISSABLE_DETAILS_SELECTOR)
      .forEach((details) => {
        const containsTarget =
          event.target instanceof Node && details.contains(event.target);
        if (!escape && containsTarget) return;
        details.open = false;
        syncDisclosure(details);
        if (escape && containsTarget) {
          event.preventDefault();
          details
            .querySelector<HTMLElement>(":scope > summary")
            ?.focus({ preventScroll: true });
        }
      });
  };

  document.addEventListener("pointerdown", press);
  document.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("keydown", press);
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  document.addEventListener("keyup", release);
  document.addEventListener("toggle", toggle, true);
  document.addEventListener("click", activateDisclosure);
  document.addEventListener("pointerdown", dismiss);
  document.addEventListener("keydown", dismiss);
  window.addEventListener("blur", release);
  reduced.addEventListener("change", release);

  return () => {
    if (spotlightRaf) window.cancelAnimationFrame(spotlightRaf);
    running.forEach((animation) => animation.cancel());
    document.documentElement.classList.remove("has-control-motion");
    document.removeEventListener("pointerdown", press);
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("keydown", press);
    document.removeEventListener("pointerup", release);
    document.removeEventListener("pointercancel", release);
    document.removeEventListener("keyup", release);
    document.removeEventListener("toggle", toggle, true);
    document.removeEventListener("click", activateDisclosure);
    document.removeEventListener("pointerdown", dismiss);
    document.removeEventListener("keydown", dismiss);
    window.removeEventListener("blur", release);
    reduced.removeEventListener("change", release);
  };
}
