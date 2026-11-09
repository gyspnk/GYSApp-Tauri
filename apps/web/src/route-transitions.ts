import { transitionReader } from "./reader-transition.js";
import { isRouteWarm, preloadRoute } from "./route-preload.js";

let navigationGeneration = 0;

/** One page entrance is owned by exactly one path. Snapshot transitions mark the
 * incoming view as already animated, so a later subtree change never replays a
 * second fade on the same page. */
const animatedViews = new WeakSet<Element>();
const PAGE_FADE_MS = 260;
const PAGE_FADE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const PRELOAD_BUDGET_MS = 180;

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function routeView(): HTMLElement | null {
  return document.querySelector<HTMLElement>(".main-content > .route-view");
}

function routeViewIsLoaded(view: Element): boolean {
  return !view.querySelector(":scope > .route-loading");
}

/** Animate only the page's opacity: a transformed route would trap the fixed
 * dialogs and toolbars rendered inside it. */
function animateRouteView(view: HTMLElement) {
  if (prefersReducedMotion()) return;
  view.animate([{ opacity: 0 }, { opacity: 1 }], {
    duration: PAGE_FADE_MS,
    easing: PAGE_FADE_EASING,
  });
}

/** Warm local route code before taking the incoming snapshot. Remote content
 * never holds navigation; the reader's compact loading state owns that work. */
export async function navigateSmooth(
  navigate: (path: string) => void,
  path: string,
) {
  const current = ++navigationGeneration;
  const origin = `${location.pathname}${location.search}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (isRouteWarm(path)) {
    // Everything the route needs is already parsed; waiting the preload race
    // only added up to PRELOAD_BUDGET_MS before the click did anything.
    void preloadRoute(path).catch(() => undefined);
  } else {
    await Promise.race([
      preloadRoute(path).catch(() => undefined),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, PRELOAD_BUDGET_MS);
      }),
    ]);
    clearTimeout(timer);
  }
  if (current !== navigationGeneration) return;
  // A history move or another navigation already left this page.
  if (`${location.pathname}${location.search}` !== origin) return;
  // The incoming view fades in once it settles (MutationObserver below).
  // Waiting for the outgoing view to fade first added 110 ms to every click
  // while the swap itself looked the same.
  await transitionReader(
    () => {
      if (current === navigationGeneration) navigate(path);
    },
    "page",
    () => {
      if (current === navigationGeneration)
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    },
  );
}

/** Keep native link semantics while fading only the changing page. Loaded
 * after the shell so navigation effects add no initial bundle cost. */
export function installRouteTransitions(navigate: (path: string) => void) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const click = (event: MouseEvent) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    const link =
      event.target instanceof Element
        ? event.target.closest<HTMLAnchorElement>("a[href]")
        : null;
    if (
      !link ||
      link.hasAttribute("download") ||
      (link.target && link.target !== "_self")
    )
      return;
    const url = new URL(link.href);
    if (
      url.origin !== location.origin ||
      (url.pathname !== base && !url.pathname.startsWith(`${base}/`))
    )
      return;
    if (url.pathname === location.pathname && url.search === location.search)
      return;
    event.preventDefault();
    void navigateSmooth(
      navigate,
      `${url.pathname.slice(base.length) || "/"}${url.search}${url.hash}`,
    );
  };
  document.addEventListener("click", click, true);
  // Only a history move cancels an in-flight link navigation. Unrelated DOM
  // mutations (data arriving, toasts, lazy images) must never swallow a click.
  const cancelPendingNavigation = () => {
    navigationGeneration++;
  };
  window.addEventListener("popstate", cancelPendingNavigation);
  document.documentElement.classList.add("has-route-transitions");

  const main = document.querySelector(".main-content");
  const observer = new MutationObserver(() => {
    const view = routeView();
    if (!view) return;
    // The snapshot transition already played this entrance.
    if (document.documentElement.classList.contains("is-reader-transition")) {
      animatedViews.add(view);
      return;
    }
    // The route skeleton stays static; only the settled page fades in.
    if (animatedViews.has(view) || !routeViewIsLoaded(view)) return;
    animatedViews.add(view);
    animateRouteView(view);
  });
  if (main) observer.observe(main, { childList: true, subtree: true });
  return () => {
    navigationGeneration++;
    observer.disconnect();
    document.documentElement.classList.remove("has-route-transitions");
    document.removeEventListener("click", click, true);
    window.removeEventListener("popstate", cancelPendingNavigation);
  };
}
