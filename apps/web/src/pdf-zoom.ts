import { clampPdfZoomPercent } from "./pdf-utils.js";

export type PdfZoomController = {
  readonly percent: number;
  zoomTo: (percent: number) => void;
  refresh: () => void;
  dispose: () => void;
};

/** Store logical geometry separately from the bounded bitmap backing it. */
export function sizePdfCanvas(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  renderedPercent: number,
  displayedPercent = renderedPercent,
) {
  canvas.dataset.pdfWidth = String(width);
  canvas.dataset.pdfHeight = String(height);
  canvas.dataset.pdfZoom = String(renderedPercent);
  canvas.style.width = `${(width * displayedPercent) / renderedPercent}px`;
  canvas.style.height = `${(height * displayedPercent) / renderedPercent}px`;
}

/** Native listeners consume browser pinch/zoom; one animation owns geometry
 * and preserves the content point under the cursor or two-finger midpoint. */
export function installPdfZoom(
  stage: HTMLElement,
  onZoom: (percent: number) => void,
): PdfZoomController {
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  let percent = 100,
    target = 100,
    frame = 0,
    previousTime = 0;
  let anchor:
    | {
        element: HTMLElement;
        x: number;
        y: number;
        screenX: number;
        screenY: number;
      }
    | undefined;
  let pinch: { distance: number; percent: number } | undefined;
  let pan:
    { x: number; y: number; pointer?: number; touch?: number } | undefined;
  const interactive = (target: EventTarget | null) =>
    target instanceof Element &&
    Boolean(
      target.closest("button, a, input, select, textarea, [contenteditable]"),
    );
  const capture = (clientX?: number, clientY?: number) => {
    const bounds = stage.getBoundingClientRect();
    const screenX = clientX ?? bounds.left + stage.clientWidth / 2;
    const screenY = clientY ?? bounds.top + stage.clientHeight / 2;
    const hit = document
      .elementFromPoint(screenX, screenY)
      ?.closest<HTMLElement>(".pdf-page-frame");
    const candidates =
      hit && stage.contains(hit)
        ? [hit]
        : Array.from(
            stage.querySelectorAll<HTMLCanvasElement>("canvas[data-pdf-width]"),
            (canvas) => canvas.parentElement!,
          );
    let closest: { element: HTMLElement; box: DOMRect } | undefined;
    let nearest = Infinity;
    for (const element of candidates) {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const distance = Math.hypot(
        Math.max(box.left - screenX, 0, screenX - box.right),
        Math.max(box.top - screenY, 0, screenY - box.bottom),
      );
      if (distance < nearest) {
        closest = { element, box };
        nearest = distance;
      }
    }
    if (!closest?.box.width || !closest.box.height) return;
    anchor = {
      element: closest.element,
      x: (screenX - closest.box.left) / closest.box.width,
      y: (screenY - closest.box.top) / closest.box.height,
      screenX,
      screenY,
    };
  };
  const refresh = () => {
    const style = getComputedStyle(stage);
    stage.style.setProperty(
      "--pdf-slot-width",
      `${stage.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)}px`,
    );
    stage.style.setProperty(
      "--pdf-slot-height",
      `${stage.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom)}px`,
    );
    stage.dataset.pdfPannable = String(percent > 100.1);
    const canvases = stage.querySelectorAll<HTMLCanvasElement>(
      "canvas[data-pdf-width]",
    );
    for (const canvas of canvases) {
      const ratio = percent / Number(canvas.dataset.pdfZoom);
      canvas.style.width = `${Number(canvas.dataset.pdfWidth) * ratio}px`;
      canvas.style.height = `${Number(canvas.dataset.pdfHeight) * ratio}px`;
      const virtualPage = canvas.closest<HTMLElement>(
        ".pdf-vertical-page, .pdf-horizontal-page",
      );
      if (virtualPage)
        virtualPage.style.minHeight = virtualPage.classList.contains(
          "pdf-horizontal-page",
        )
          ? ""
          : canvas.style.height;
    }
    for (const layer of stage.querySelectorAll<HTMLElement>(
      ".pdf-detail-layer[data-pdf-zoom]",
    )) {
      const canvas =
        layer.parentElement?.querySelector<HTMLCanvasElement>(
          ":scope > canvas",
        );
      if (canvas)
        layer.style.transform = `scale(${(Number(canvas.dataset.pdfWidth) * percent) / Number(canvas.dataset.pdfZoom) / parseFloat(layer.style.width)})`;
    }
    stage.style.setProperty("--pdf-chord-scale", String(percent / 100));
    if (
      percent === 100 &&
      target === 100 &&
      (stage.dataset.pdfLayout === "single" ||
        stage.dataset.pdfLayout === "two")
    ) {
      stage.scrollLeft = stage.scrollTop = 0;
    } else if (anchor?.element.isConnected) {
      const bounds = anchor.element.getBoundingClientRect();
      stage.scrollLeft +=
        bounds.left + bounds.width * anchor.x - anchor.screenX;
      stage.scrollTop += bounds.top + bounds.height * anchor.y - anchor.screenY;
    }
  };
  const tick = (time: number) => {
    if (pinch) {
      // Direct manipulation follows the latest fingers once per frame. Keep
      // raster replacement suspended throughout the gesture, including pauses.
      percent = target;
      previousTime = frame = 0;
      refresh();
      onZoom(percent);
      return;
    }
    // A delayed frame must not turn continuous zoom into a large geometry jump.
    const elapsed = previousTime ? Math.min(time - previousTime, 16) : 16;
    previousTime = time;
    percent += (target - percent) * (1 - Math.exp(-elapsed / 55));
    const finished = Math.abs(target - percent) < 0.02;
    if (finished) percent = target;
    refresh();
    if (finished) {
      frame = previousTime = 0;
      anchor = undefined;
      delete stage.dataset.pdfZooming;
      stage.dispatchEvent(new Event("pdfzoomend"));
    } else frame = requestAnimationFrame(tick);
  };
  const update = (next: number, clientX?: number, clientY?: number) => {
    next = clampPdfZoomPercent(next);
    if (next === target && !pinch) return;
    if (!pinch) capture(clientX, clientY);
    target = next;
    if (stage.dataset.pdfZooming !== "true") {
      stage.dataset.pdfZooming = "true";
      stage.dispatchEvent(new Event("pdfzoomstart"));
    }
    if (!pinch) onZoom(target);
    if (reducedMotion.matches && !pinch) {
      cancelAnimationFrame(frame);
      frame = previousTime = 0;
      percent = target;
      refresh();
      anchor = undefined;
      delete stage.dataset.pdfZooming;
      stage.dispatchEvent(new Event("pdfzoomend"));
    } else if (!frame) frame = requestAnimationFrame(tick);
  };
  const wheel = (event: WheelEvent) => {
    const units =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? stage.clientHeight
          : 1;
    if (!event.ctrlKey && !event.metaKey) {
      if (stage.dataset.pdfLayout === "horizontal") {
        event.preventDefault();
        stage.scrollLeft +=
          (Math.abs(event.deltaX) > Math.abs(event.deltaY)
            ? event.deltaX
            : event.deltaY) * units;
      }
      return;
    }
    event.preventDefault();
    update(
      target * Math.exp(-event.deltaY * units * 0.002),
      event.clientX,
      event.clientY,
    );
  };
  const distance = (touches: TouchList) =>
    Math.hypot(
      touches[0]!.clientX - touches[1]!.clientX,
      touches[0]!.clientY - touches[1]!.clientY,
    );
  const settleZoom = (finishTarget = false) => {
    const wasAnimating = Boolean(frame) || stage.dataset.pdfZooming === "true";
    cancelAnimationFrame(frame);
    frame = previousTime = 0;
    // Pan starts from the paper the user currently sees, not a pending wheel
    // target. Finger release commits the last coalesced pinch position.
    if (!finishTarget) target = percent;
    percent = target;
    refresh();
    if (wasAnimating) onZoom(Math.round(target));
    anchor = undefined;
    delete stage.dataset.pdfZooming;
    if (wasAnimating) stage.dispatchEvent(new Event("pdfzoomend"));
  };
  const start = (event: TouchEvent) => {
    if (
      event.touches.length === 1 &&
      (percent > 100 || stage.dataset.pdfLayout === "horizontal") &&
      !interactive(event.target)
    ) {
      const touch = event.touches[0]!;
      settleZoom();
      pan = { x: touch.clientX, y: touch.clientY, touch: touch.identifier };
      return;
    }
    if (event.touches.length !== 2) {
      pinch = pan = undefined;
      anchor = undefined;
      return;
    }
    pan = undefined;
    event.preventDefault();
    const initial = distance(event.touches);
    if (!initial) return;
    cancelAnimationFrame(frame);
    frame = previousTime = 0;
    target = percent;
    capture(
      (event.touches[0]!.clientX + event.touches[1]!.clientX) / 2,
      (event.touches[0]!.clientY + event.touches[1]!.clientY) / 2,
    );
    pinch = { distance: initial, percent };
  };
  const move = (event: TouchEvent) => {
    if (pan && event.touches.length === 1 && !pinch) {
      event.preventDefault();
      const touch = event.touches[0]!;
      if (touch.identifier !== pan.touch) {
        pan = undefined;
        return;
      }
      stage.scrollLeft += pan.x - touch.clientX;
      stage.scrollTop += pan.y - touch.clientY;
      pan = { x: touch.clientX, y: touch.clientY, touch: touch.identifier };
      return;
    }
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    if (anchor) {
      anchor.screenX =
        (event.touches[0]!.clientX + event.touches[1]!.clientX) / 2;
      anchor.screenY =
        (event.touches[0]!.clientY + event.touches[1]!.clientY) / 2;
    }
    update((pinch.percent * distance(event.touches)) / pinch.distance);
  };
  const end = (event: TouchEvent) => {
    if (pinch) settleZoom(true);
    pinch = undefined;
    pan = undefined;
    if (
      event.type === "touchend" &&
      event.touches.length === 1 &&
      (percent > 100 || stage.dataset.pdfLayout === "horizontal")
    ) {
      const touch = event.touches[0]!;
      pan = { x: touch.clientX, y: touch.clientY, touch: touch.identifier };
    }
  };
  const pointerDown = (event: PointerEvent) => {
    if (
      event.pointerType === "touch" ||
      event.button !== 0 ||
      (percent <= 100 && stage.dataset.pdfLayout !== "horizontal") ||
      interactive(event.target)
    )
      return;
    settleZoom();
    pan = { x: event.clientX, y: event.clientY, pointer: event.pointerId };
    stage.setPointerCapture(event.pointerId);
    stage.dataset.pdfDragging = "true";
    event.preventDefault();
  };
  const pointerMove = (event: PointerEvent) => {
    if (!pan || pan.pointer !== event.pointerId) return;
    stage.scrollLeft += pan.x - event.clientX;
    stage.scrollTop += pan.y - event.clientY;
    pan.x = event.clientX;
    pan.y = event.clientY;
  };
  const pointerEnd = (event: PointerEvent) => {
    if (pan?.pointer !== event.pointerId) return;
    pan = undefined;
    delete stage.dataset.pdfDragging;
    if (stage.hasPointerCapture(event.pointerId))
      stage.releasePointerCapture(event.pointerId);
  };
  stage.addEventListener("wheel", wheel, { passive: false });
  stage.addEventListener("touchstart", start, { passive: false });
  stage.addEventListener("touchmove", move, { passive: false });
  stage.addEventListener("touchend", end);
  stage.addEventListener("touchcancel", end);
  stage.addEventListener("pointerdown", pointerDown);
  stage.addEventListener("pointermove", pointerMove);
  stage.addEventListener("pointerup", pointerEnd);
  stage.addEventListener("pointercancel", pointerEnd);
  stage.addEventListener("lostpointercapture", pointerEnd);
  return {
    get percent() {
      return percent;
    },
    zoomTo: update,
    refresh,
    dispose() {
      cancelAnimationFrame(frame);
      if (pan?.pointer !== undefined && stage.hasPointerCapture(pan.pointer))
        stage.releasePointerCapture(pan.pointer);
      pinch = pan = anchor = undefined;
      stage.removeEventListener("wheel", wheel);
      stage.removeEventListener("touchstart", start);
      stage.removeEventListener("touchmove", move);
      stage.removeEventListener("touchend", end);
      stage.removeEventListener("touchcancel", end);
      stage.removeEventListener("pointerdown", pointerDown);
      stage.removeEventListener("pointermove", pointerMove);
      stage.removeEventListener("pointerup", pointerEnd);
      stage.removeEventListener("pointercancel", pointerEnd);
      stage.removeEventListener("lostpointercapture", pointerEnd);
      delete stage.dataset.pdfDragging;
      delete stage.dataset.pdfPannable;
      delete stage.dataset.pdfZooming;
    },
  };
}
