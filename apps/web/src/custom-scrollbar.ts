/**
 * Lightweight, theme-aware JavaScript overlay scrollbar for Chrome & Tauri WebView.
 * Native scrollbars are hidden via CSS; this module renders a GPU-composited
 * floating track + pill thumb for both the document viewport and any inner
 * vertically scrollable container (e.g. Kidung rail, search list, pickers).
 */

const MIN_THUMB_PX = 36;
const IDLE_HIDE_MS = 1100;
const EDGE_PROXIMITY_PX = 28;
const TRACK_INSET_PX = 6;

type ScrollTarget = Document | HTMLElement;

function isDocumentTarget(target: ScrollTarget): target is Document {
  return target === document;
}

function getScrollMetrics(target: ScrollTarget) {
  if (isDocumentTarget(target)) {
    const el = document.scrollingElement ?? document.documentElement;
    return {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
      clientHeight: window.innerHeight,
      rect: {
        top: 0,
        right: window.innerWidth,
        bottom: window.innerHeight,
        left: 0,
        height: window.innerHeight,
      },
    };
  }
  const rect = target.getBoundingClientRect();
  return {
    scrollTop: target.scrollTop,
    scrollHeight: target.scrollHeight,
    clientHeight: target.clientHeight,
    rect,
  };
}

function setScrollTop(target: ScrollTarget, value: number) {
  if (isDocumentTarget(target)) {
    const el = document.scrollingElement ?? document.documentElement;
    el.scrollTop = value;
  } else {
    target.scrollTop = value;
  }
}

function isVerticallyScrollable(el: HTMLElement): boolean {
  if (el.scrollHeight <= el.clientHeight + 2) return false;
  const overflowY = getComputedStyle(el).overflowY;
  return overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay";
}

function findScrollableAncestor(node: EventTarget | null): ScrollTarget {
  let current = node instanceof Element ? node : null;
  while (current && current !== document.body && current !== document.documentElement) {
    if (current instanceof HTMLElement && isVerticallyScrollable(current)) {
      return current;
    }
    current = current.parentElement;
  }
  return document;
}

export function installCustomScrollbar(): () => void {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return () => undefined;
  }

  document.documentElement.classList.add("has-custom-scrollbar");

  const track = document.createElement("div");
  track.className = "gys-scrollbar-track";
  track.setAttribute("aria-hidden", "true");

  const thumb = document.createElement("div");
  thumb.className = "gys-scrollbar-thumb";
  track.appendChild(thumb);
  document.body.appendChild(track);

  let activeTarget: ScrollTarget = document;
  let rafId = 0;
  let hideTimer: number | undefined;
  let hovered = false;
  let dragging = false;
  let dragStartY = 0;
  let dragStartScrollTop = 0;
  let currentTrackLen = 0;
  let currentThumbLen = MIN_THUMB_PX;
  let currentMaxScroll = 0;

  const scheduleHide = () => {
    if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    if (hovered || dragging) return;
    hideTimer = window.setTimeout(() => {
      track.classList.remove("is-visible");
      hideTimer = undefined;
    }, IDLE_HIDE_MS);
  };

  const render = () => {
    rafId = 0;
    if (!isDocumentTarget(activeTarget) && !activeTarget.isConnected) {
      activeTarget = document;
    }
    const { scrollTop, scrollHeight, clientHeight, rect } =
      getScrollMetrics(activeTarget);
    const maxScroll = Math.max(0, scrollHeight - clientHeight);
    if (maxScroll <= 2 || rect.height < 48) {
      track.classList.remove("is-visible");
      currentMaxScroll = 0;
      return;
    }

    const trackTop = Math.max(0, rect.top) + TRACK_INSET_PX;
    const trackBottom = Math.min(window.innerHeight, rect.bottom) - TRACK_INSET_PX;
    const trackLen = Math.max(0, trackBottom - trackTop);
    if (trackLen < MIN_THUMB_PX) {
      track.classList.remove("is-visible");
      return;
    }

    const thumbLen = Math.max(
      MIN_THUMB_PX,
      Math.min(trackLen, (clientHeight / scrollHeight) * trackLen),
    );
    const ratio = maxScroll > 0 ? Math.min(1, Math.max(0, scrollTop / maxScroll)) : 0;
    const thumbOffset = ratio * (trackLen - thumbLen);

    currentTrackLen = trackLen;
    currentThumbLen = thumbLen;
    currentMaxScroll = maxScroll;

    const rightOffset = Math.max(2, window.innerWidth - rect.right + 2);
    track.style.top = `${trackTop}px`;
    track.style.height = `${trackLen}px`;
    track.style.right = `${rightOffset}px`;
    thumb.style.height = `${thumbLen}px`;
    thumb.style.transform = `translate3d(0, ${thumbOffset}px, 0)`;
  };

  const sync = (reveal: boolean) => {
    if (reveal) {
      track.classList.add("is-visible");
      scheduleHide();
    }
    if (!rafId) {
      rafId = window.requestAnimationFrame(render);
    }
  };

  const onScroll = (event: Event) => {
    const raw = event.target;
    if (
      raw === document ||
      raw === document.documentElement ||
      raw === document.body
    ) {
      activeTarget = document;
    } else if (raw instanceof HTMLElement && isVerticallyScrollable(raw)) {
      activeTarget = raw;
    } else {
      return;
    }
    sync(true);
  };

  const onPointerMoveDoc = (event: PointerEvent) => {
    if (dragging || event.pointerType === "touch") return;
    const candidate = findScrollableAncestor(event.target);
    const { scrollHeight, clientHeight, rect } = getScrollMetrics(candidate);
    if (scrollHeight <= clientHeight + 2) return;
    if (rect.right - event.clientX <= EDGE_PROXIMITY_PX && event.clientX <= rect.right + 4) {
      activeTarget = candidate;
      sync(true);
    }
  };

  const onTrackEnter = () => {
    hovered = true;
    track.classList.add("is-visible", "is-hovered");
    if (hideTimer !== undefined) {
      window.clearTimeout(hideTimer);
      hideTimer = undefined;
    }
  };

  const onTrackLeave = () => {
    hovered = false;
    track.classList.remove("is-hovered");
    scheduleHide();
  };

  const onTrackPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || currentMaxScroll <= 0) return;
    event.preventDefault();
    event.stopPropagation();

    if (event.target === thumb) {
      dragging = true;
      dragStartY = event.clientY;
      dragStartScrollTop = getScrollMetrics(activeTarget).scrollTop;
      track.classList.add("is-dragging", "is-visible");
      thumb.setPointerCapture(event.pointerId);
      return;
    }

    const trackRect = track.getBoundingClientRect();
    const clickY = event.clientY - trackRect.top - currentThumbLen / 2;
    const travel = Math.max(1, currentTrackLen - currentThumbLen);
    const targetTop = Math.max(0, Math.min(1, clickY / travel)) * currentMaxScroll;
    if (isDocumentTarget(activeTarget)) {
      window.scrollTo({ top: targetTop, behavior: "smooth" });
    } else {
      activeTarget.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  };

  const onThumbPointerMove = (event: PointerEvent) => {
    if (!dragging || currentMaxScroll <= 0) return;
    const travel = Math.max(1, currentTrackLen - currentThumbLen);
    const deltaY = event.clientY - dragStartY;
    const nextTop =
      dragStartScrollTop + (deltaY / travel) * currentMaxScroll;
    setScrollTop(
      activeTarget,
      Math.max(0, Math.min(currentMaxScroll, nextTop)),
    );
    sync(true);
  };

  const onThumbPointerUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    track.classList.remove("is-dragging");
    try {
      if (thumb.hasPointerCapture(event.pointerId)) {
        thumb.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Already released.
    }
    scheduleHide();
  };

  const onResize = () => sync(false);

  document.addEventListener("scroll", onScroll, { capture: true, passive: true });
  document.addEventListener("pointermove", onPointerMoveDoc, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  track.addEventListener("pointerenter", onTrackEnter);
  track.addEventListener("pointerleave", onTrackLeave);
  track.addEventListener("pointerdown", onTrackPointerDown);
  thumb.addEventListener("pointermove", onThumbPointerMove);
  thumb.addEventListener("pointerup", onThumbPointerUp);
  thumb.addEventListener("pointercancel", onThumbPointerUp);

  return () => {
    if (rafId) window.cancelAnimationFrame(rafId);
    if (hideTimer !== undefined) window.clearTimeout(hideTimer);
    document.removeEventListener("scroll", onScroll, true);
    document.removeEventListener("pointermove", onPointerMoveDoc);
    window.removeEventListener("resize", onResize);
    track.removeEventListener("pointerenter", onTrackEnter);
    track.removeEventListener("pointerleave", onTrackLeave);
    track.removeEventListener("pointerdown", onTrackPointerDown);
    thumb.removeEventListener("pointermove", onThumbPointerMove);
    thumb.removeEventListener("pointerup", onThumbPointerUp);
    thumb.removeEventListener("pointercancel", onThumbPointerUp);
    track.remove();
    document.documentElement.classList.remove("has-custom-scrollbar");
  };
}
