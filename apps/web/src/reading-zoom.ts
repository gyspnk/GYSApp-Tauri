/** Text zoom leaves navigation and controls usable; ordinary scrolling stays native. */
export function installReadingZoom(element: HTMLElement): () => void {
  let scale = 1;
  let targetScale = 1;
  let frame = 0;
  let previousTime = 0;
  let pinch: { distance: number; scale: number } | undefined;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const rowMotion = new Map<HTMLElement, Animation>();
  const apply = (next: number) => {
    const visibleRows = reducedMotion.matches
      ? []
      : Array.from(element.querySelectorAll<HTMLElement>(".verse-row"))
          .map((row) => ({ row, box: row.getBoundingClientRect() }))
          .filter(({ box }) => box.bottom > 0 && box.top < innerHeight);
    scale = next;
    element.style.setProperty("--reading-text-scale", String(scale));
    // FLIP keeps visible verses moving continuously when a line wraps.
    for (const { row, box } of visibleRows) {
      rowMotion.get(row)?.cancel();
      const offset = box.top - row.getBoundingClientRect().top;
      if (Math.abs(offset) < 0.5) {
        rowMotion.delete(row);
        continue;
      }
      const animation = row.animate(
        [
          { transform: `translateY(${offset}px)` },
          { transform: "translateY(0)" },
        ],
        { duration: 100, easing: "cubic-bezier(.22, 1, .36, 1)" },
      );
      rowMotion.set(row, animation);
      animation.onfinish = () => rowMotion.delete(row);
    }
  };
  const tick = (time: number) => {
    const elapsed = previousTime ? Math.min(time - previousTime, 64) : 16;
    previousTime = time;
    // Time-based damping behaves consistently on 60/120Hz displays and
    // accepts a new target mid-animation without restarting or snapping.
    const next = scale + (targetScale - scale) * (1 - Math.exp(-elapsed / 70));
    if (Math.abs(targetScale - next) < 0.0005) {
      apply(targetScale);
      frame = 0;
      previousTime = 0;
    } else {
      apply(next);
      frame = requestAnimationFrame(tick);
    }
  };
  const update = (next: number) => {
    targetScale = Math.max(0.75, Math.min(3, next));
    if (reducedMotion.matches) {
      cancelAnimationFrame(frame);
      frame = 0;
      previousTime = 0;
      apply(targetScale);
    } else if (!frame) frame = requestAnimationFrame(tick);
  };
  const distance = (touches: TouchList) =>
    Math.hypot(
      touches[0]!.clientX - touches[1]!.clientX,
      touches[0]!.clientY - touches[1]!.clientY,
    );
  const wheel = (event: WheelEvent) => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    const units =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? element.clientHeight
          : 1;
    update(targetScale * Math.exp(-event.deltaY * units * 0.002));
  };
  const start = (event: TouchEvent) => {
    pinch = undefined;
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const initialDistance = distance(event.touches);
    if (initialDistance > 0)
      pinch = { distance: initialDistance, scale: targetScale };
  };
  const move = (event: TouchEvent) => {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    update((pinch.scale * distance(event.touches)) / pinch.distance);
  };
  const end = () => {
    pinch = undefined;
  };
  element.addEventListener("wheel", wheel, { passive: false });
  element.addEventListener("touchstart", start, { passive: false });
  element.addEventListener("touchmove", move, { passive: false });
  element.addEventListener("touchend", end);
  element.addEventListener("touchcancel", end);
  return () => {
    cancelAnimationFrame(frame);
    rowMotion.forEach((animation) => animation.cancel());
    element.removeEventListener("wheel", wheel);
    element.removeEventListener("touchstart", start);
    element.removeEventListener("touchmove", move);
    element.removeEventListener("touchend", end);
    element.removeEventListener("touchcancel", end);
    element.style.removeProperty("--reading-text-scale");
  };
}
