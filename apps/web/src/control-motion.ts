/** Delegated native motion: no per-button listeners or animation dependency. */
export function installControlMotion(): () => void {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const running = new Map<HTMLElement, Animation>();
  const pressed = new Set<HTMLElement>();
  const control = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>("button:not(:disabled), a[href], summary")
      : null;
  const animate = (element: HTMLElement, scale: string) => {
    const from = getComputedStyle(element).scale;
    running.get(element)?.cancel();
    const animation = element.animate([{ scale: from }, { scale }], {
      duration: scale === "1" ? 220 : 110,
      easing: "cubic-bezier(.22, 1, .36, 1)",
      fill: scale === "1" ? "none" : "forwards",
    });
    running.set(element, animation);
    if (scale === "1") animation.onfinish = () => running.delete(element);
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
    animate(element, ".97");
  };
  const release = () => {
    pressed.forEach((element) => {
      if (element.isConnected && !reduced.matches) animate(element, "1");
      else {
        running.get(element)?.cancel();
        running.delete(element);
      }
    });
    pressed.clear();
  };
  const syncDisclosure = (details: HTMLDetailsElement) => {
    for (const child of details.children) {
      if (child.tagName === "SUMMARY") continue;
      // Exit remains visible briefly, but its controls stop accepting input.
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
    // The native default action runs after click dispatch; toggle is queued
    // separately and can arrive after the user's next focus/key action.
    queueMicrotask(() => syncDisclosure(details));
  };
  const dismiss = (event: PointerEvent | KeyboardEvent) => {
    if (event.defaultPrevented) return;
    const escape = event instanceof KeyboardEvent && event.key === "Escape";
    if (event instanceof KeyboardEvent && !escape) return;
    document
      .querySelectorAll<HTMLDetailsElement>(
        ".hymn-more-actions[open], .hymn-reader-settings[open], .media-advanced-controls[open], .pdf-music-menu[open], .faith-pdf-sources[open], .kidung-row-menu[open]",
      )
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
    running.forEach((animation) => animation.cancel());
    document.removeEventListener("pointerdown", press);
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
