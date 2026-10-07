import { routeModules } from "./route-pages.js";
type RouteId = keyof typeof routeModules;
const pending = new Map<RouteId, Promise<unknown>>();
const routes: Record<string, RouteId> = {
  "/": "home",
  "/bible": "bible",
  "/kidung": "kidung",
  "/iman": "faith",
  "/lainnya": "more",
  "/literatur": "literature",
  "/sauh": "articles",
  "/suara": "articles",
};

export function preloadRoute(path: string): Promise<unknown> {
  const pathname = path.split(/[?#]/)[0] ?? "/";
  const id = routes[pathname] ?? routes[`/${pathname.split("/")[1]}`];
  if (!id) return Promise.resolve();
  if (!pending.has(id)) {
    const task = routeModules[id]()
      .then(async (module) => {
        if (id === "faith")
          await import("./faith-payloads.js").then((m) => m.loadFaithPack());
        if (id === "bible")
          await import("./bible-pack-loader.js").then((m) =>
            m.loadBundledBiblePack(),
          );
        if (id === "kidung")
          await Promise.all([
            import("./kidung-page.js").then((m) => m.preloadKidungCatalog()),
            import("./hymn-payloads.js").then((m) => m.loadCoreHymnMetadata()),
          ]);
        if (id === "literature")
          await import("./literature-catalog.js").then((m) =>
            m.fetchLiteratureCatalog(),
          );
        performance.mark(`gys-route-preloaded:${id}`);
        return module;
      })
      .catch((error) => {
        pending.delete(id);
        throw error;
      });
    pending.set(id, task);
  }
  const route =
    id === "kidung"
      ? Promise.all([
          pending.get(id)!,
          import("./kidung-page.js").then((m) => m.preloadKidungView(path)),
        ])
      : pending.get(id)!;
  return (pathname.startsWith("/literatur/") &&
    /[?&]read=1(?:&|$)/.test(path)) ||
    (pathname.startsWith("/kidung/") && /[?&]mode=pdf(?:&|$)/.test(path))
    ? Promise.all([
        route,
        import("./pdf-reader-loader.js").then((m) => m.preloadPdfReader()),
      ])
    : route;
}

/** Warm sequentially after first paint, avoiding optional downloads and data-saving connections. */
export function warmNavigation(): () => void {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (connection?.saveData || /(^|-)2g$/.test(connection?.effectiveType ?? ""))
    return () => {};
  let cancelled = false;
  let timer: number;
  let idle: number | undefined;
  const paths = [
    "/iman",
    "/kidung",
    "/bible",
    "/lainnya",
    "/",
    "/literatur",
    "/suara",
  ];
  const next = () => {
    if (cancelled || !paths.length) return;
    const run = () => {
      if (cancelled) return;
      void preloadRoute(paths.shift()!)
        .catch(() => undefined)
        .finally(() => {
          if (!cancelled) timer = window.setTimeout(next, 100);
        });
    };
    if (typeof window.requestIdleCallback === "function")
      idle = window.requestIdleCallback(run, { timeout: 1000 });
    else timer = window.setTimeout(run, 100);
  };
  timer = window.setTimeout(next, 200);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
