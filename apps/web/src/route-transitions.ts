import { transitionReader } from "./reader-transition.js";
import { preloadRoute } from "./route-preload.js";

let navigationGeneration = 0;

/** Warm local route code before taking the incoming snapshot. Remote content
 * never holds navigation; the reader's compact loading state owns that work. */
export async function navigateSmooth(
  navigate: (path: string) => void,
  path: string,
) {
  const current = ++navigationGeneration;
  let timer: ReturnType<typeof setTimeout> | undefined;
  await Promise.race([
    preloadRoute(path).catch(() => undefined),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, 180);
    }),
  ]);
  clearTimeout(timer);
  if (current === navigationGeneration)
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
  const cancelPendingNavigation = () => {
    navigationGeneration++;
  };
  window.addEventListener("popstate", cancelPendingNavigation);
  document.documentElement.classList.add("has-route-transitions");
  const main = document.querySelector(".main-content");
  let arrival: Animation | undefined;
  const observer = new MutationObserver(() => {
    // History and programmatic navigation also animate, without replaying
    // the entrance after a native view transition has finished.
    if (document.documentElement.classList.contains("is-reader-transition"))
      return;
    // A history/button navigation supersedes an earlier link's async preload.
    cancelPendingNavigation();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const page = main?.querySelector<HTMLElement>(":scope > .route-view");
    if (!page) return;
    arrival?.cancel();
    arrival = page.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 260,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    });
  });
  if (main) observer.observe(main, { childList: true });
  return () => {
    navigationGeneration++;
    observer.disconnect();
    arrival?.cancel();
    document.documentElement.classList.remove("has-route-transitions");
    document.removeEventListener("click", click, true);
    window.removeEventListener("popstate", cancelPendingNavigation);
  };
}
