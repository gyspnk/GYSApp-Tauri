/** Text zoom leaves navigation and controls usable; ordinary scrolling stays native. */
export function installReadingZoom(element: HTMLElement): () => void {
  let scale = 1;
  let frame = 0;
  let pinch: { distance: number; scale: number } | undefined;
  const update = (next: number) => {
    scale = Math.max(0.75, Math.min(3, next));
    if (!frame)
      frame = requestAnimationFrame(() => {
        frame = 0;
        element.style.setProperty("--reading-text-scale", String(scale));
      });
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
    update(scale * Math.exp(-event.deltaY * units * 0.002));
  };
  const start = (event: TouchEvent) => {
    pinch = undefined;
    if (event.touches.length !== 2) return;
    event.preventDefault();
    const initialDistance = distance(event.touches);
    if (initialDistance > 0) pinch = { distance: initialDistance, scale };
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
    element.removeEventListener("wheel", wheel);
    element.removeEventListener("touchstart", start);
    element.removeEventListener("touchmove", move);
    element.removeEventListener("touchend", end);
    element.removeEventListener("touchcancel", end);
    element.style.removeProperty("--reading-text-scale");
  };
}
