import { transitionReader } from "./reader-transition.js";
import { isRouteWarm, preloadRoute } from "./route-preload.js";

let navigationGeneration = 0;
let navigationInFlight = false;
let navigationInFlightOwner = 0;

const animatedViews = new WeakSet<Element>();
const PAGE_FADE_MS = 240;
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

/** Animate opacity + subtle focus settle without `transform` so fixed dialogs
 * and floating toolbars inside the route keep viewport positioning. */
function animateRouteView(view: HTMLElement) {
  if (prefersReducedMotion()) return;
  view.animate(
    [
      { opacity: 0, filter: "blur(2px)" },
      { opacity: 1, filter: "blur(0px)" },
    ],
    {
      duration: PAGE_FADE_MS,
      easing: PAGE_FADE_EASING,
    },
  );
}

export type RouteNavigate = (
  path: string,
  options?: { replace?: boolean },
) => void;

export async function navigateSmooth(navigate: RouteNavigate, path: string) {
  const replace = navigationInFlight;
  navigationInFlight = true;
  const current = ++navigationGeneration;
  navigationInFlightOwner = current;
  const origin = `${location.pathname}${location.search}`;
  let timer: ReturnType<typeof setTimeout> | undefined;
  if (isRouteWarm(path)) {
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
  if (current !== navigationGeneration) {
    if (navigationInFlightOwner === current) navigationInFlight = false;
    return;
  }
  if (`${location.pathname}${location.search}` !== origin) {
    if (navigationInFlightOwner === current) navigationInFlight = false;
    return;
  }
  await transitionReader(
    () => {
      if (current === navigationGeneration)
        navigate(path, replace ? { replace: true } : undefined);
    },
    "page",
    () => {
      if (current === navigationGeneration)
        window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    },
  ).finally(() => {
    if (navigationInFlightOwner === current) navigationInFlight = false;
  });
}

export function installRouteTransitions(navigate: RouteNavigate) {
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
  const cancelPendingNavigation = () => {
    navigationGeneration++;
    navigationInFlight = false;
    navigationInFlightOwner = 0;
  };
  window.addEventListener("popstate", cancelPendingNavigation);
  document.documentElement.classList.add("has-route-transitions");

  const main = document.querySelector(".main-content");
  const observer = new MutationObserver(() => {
    const view = routeView();
    if (!view) return;
    if (document.documentElement.classList.contains("is-reader-transition")) {
      animatedViews.add(view);
      return;
    }
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
