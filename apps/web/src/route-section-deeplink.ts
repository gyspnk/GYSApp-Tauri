const MORE_SECTION_TARGETS: Record<string, string> = {
  data: ".distributed-assets-card",
};

const ALIGN_TOLERANCE_PX = 1;
const REALIGN_WINDOW_PX = 160;
const SCROLL_KEYS = new Set([
  "ArrowDown",
  "ArrowUp",
  "End",
  "Home",
  "PageDown",
  "PageUp",
  " ",
]);

export function resolveRouteSectionTarget(location: {
  pathname: string;
  search: string;
}): string | undefined {
  if (!location.pathname.endsWith("/lainnya")) return undefined;
  const section = new URLSearchParams(location.search).get("section");
  return section ? MORE_SECTION_TARGETS[section] : undefined;
}

function desiredTargetTop(): number {
  const topbar = document.querySelector<HTMLElement>(".topbar");
  return (topbar?.getBoundingClientRect().height ?? 0) + 12;
}

function targetDelta(target: HTMLElement): number {
  return target.getBoundingClientRect().top - desiredTargetTop();
}

function scrollTargetBelowTopbar(target: HTMLElement): void {
  const delta = targetDelta(target);
  if (Math.abs(delta) <= ALIGN_TOLERANCE_PX) return;
  window.scrollBy({ top: delta, behavior: "auto" });
}

export function installRouteSectionDeepLinks(
  root: HTMLElement | null = document.getElementById("root"),
): () => void {
  if (!root) return () => undefined;

  let alignedLocation = "";
  let trackedLocation = "";
  let userInterrupted = false;
  let frame = 0;

  const revealLinkedSection = () => {
    const selector = resolveRouteSectionTarget(window.location);
    if (!selector) {
      alignedLocation = "";
      trackedLocation = "";
      userInterrupted = false;
      return;
    }

    const locationKey = `${window.location.pathname}${window.location.search}`;
    if (trackedLocation !== locationKey) {
      trackedLocation = locationKey;
      alignedLocation = "";
      userInterrupted = false;
    }

    if (userInterrupted) return;

    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;

    // The More route renders the account card before its asynchronous profile
    // check finishes. Scrolling while that loading box is still present leaves
    // the linked section stranded when the card later shrinks.
    if (document.querySelector(".account-loading-box")) return;

    const delta = targetDelta(target);
    const alreadyAligned = alignedLocation === locationKey;

    // After the initial alignment, keep correcting nearby async layout shifts
    // (manifest/profile/catalog text can change height). If the target is far
    // from the anchor, assume the user has intentionally navigated elsewhere.
    if (alreadyAligned && Math.abs(delta) > REALIGN_WINDOW_PX) return;

    alignedLocation = locationKey;
    if (Math.abs(delta) <= ALIGN_TOLERANCE_PX) return;

    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => scrollTargetBelowTopbar(target));
  };

  const interruptAutoAlign = () => {
    if (alignedLocation) userInterrupted = true;
  };
  const interruptAutoAlignByKey = (event: KeyboardEvent) => {
    if (SCROLL_KEYS.has(event.key)) interruptAutoAlign();
  };

  const observer = new MutationObserver(revealLinkedSection);
  observer.observe(root, {
    attributes: true,
    characterData: true,
    childList: true,
    subtree: true,
  });
  window.addEventListener("popstate", revealLinkedSection);
  window.addEventListener("wheel", interruptAutoAlign, { passive: true });
  window.addEventListener("touchstart", interruptAutoAlign, { passive: true });
  window.addEventListener("pointerdown", interruptAutoAlign);
  window.addEventListener("keydown", interruptAutoAlignByKey);
  queueMicrotask(revealLinkedSection);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("popstate", revealLinkedSection);
    window.removeEventListener("wheel", interruptAutoAlign);
    window.removeEventListener("touchstart", interruptAutoAlign);
    window.removeEventListener("pointerdown", interruptAutoAlign);
    window.removeEventListener("keydown", interruptAutoAlignByKey);
  };
}
