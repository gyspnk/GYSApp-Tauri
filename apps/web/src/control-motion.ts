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
  const toggle = (event: Event) => {
    const details = event.target;
    if (
      reduced.matches ||
      !(details instanceof HTMLDetailsElement) ||
      !details.open
    )
      return;
    for (const child of details.children) {
      if (child.tagName === "SUMMARY") continue;
      child.animate(
        [
          { opacity: 0, translate: "0 -4px" },
          { opacity: 1, translate: "0 0" },
        ],
        {
          duration: 200,
          easing: "cubic-bezier(.22, 1, .36, 1)",
        },
      );
    }
  };
  document.addEventListener("pointerdown", press);
  document.addEventListener("keydown", press);
  document.addEventListener("pointerup", release);
  document.addEventListener("pointercancel", release);
  document.addEventListener("keyup", release);
  document.addEventListener("toggle", toggle, true);
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
    window.removeEventListener("blur", release);
    reduced.removeEventListener("change", release);
  };
}
