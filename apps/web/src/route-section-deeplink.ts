const MORE_SECTION_TARGETS: Record<string, string> = {
  data: ".distributed-assets-card",
};

export function resolveRouteSectionTarget(location: {
  pathname: string;
  search: string;
}): string | undefined {
  if (!location.pathname.endsWith("/lainnya")) return undefined;
  const section = new URLSearchParams(location.search).get("section");
  return section ? MORE_SECTION_TARGETS[section] : undefined;
}

function scrollTargetBelowTopbar(target: HTMLElement): void {
  const topbar = document.querySelector<HTMLElement>(".topbar");
  const topbarHeight = topbar?.getBoundingClientRect().height ?? 0;
  const targetTop = target.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({
    top: Math.max(0, targetTop - topbarHeight - 12),
    behavior: "auto",
  });
}

export function installRouteSectionDeepLinks(
  root: HTMLElement | null = document.getElementById("root"),
): () => void {
  if (!root) return () => undefined;

  let handledLocation = "";
  let frame = 0;

  const revealLinkedSection = () => {
    const selector = resolveRouteSectionTarget(window.location);
    if (!selector) {
      handledLocation = "";
      return;
    }

    const locationKey = `${window.location.pathname}${window.location.search}`;
    if (handledLocation === locationKey) return;

    const target = document.querySelector<HTMLElement>(selector);
    if (!target) return;

    // The More route renders the account card before its asynchronous profile
    // check finishes. Scrolling while that loading box is still present leaves
    // the section stranded under the sticky topbar when the card later shrinks.
    if (document.querySelector(".account-loading-box")) return;

    handledLocation = locationKey;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => scrollTargetBelowTopbar(target));
  };

  const observer = new MutationObserver(revealLinkedSection);
  observer.observe(root, { childList: true, subtree: true });
  window.addEventListener("popstate", revealLinkedSection);
  queueMicrotask(revealLinkedSection);

  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    window.removeEventListener("popstate", revealLinkedSection);
  };
}
