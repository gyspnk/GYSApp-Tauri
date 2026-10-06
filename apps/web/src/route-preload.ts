/** Shared import promises keep navigation and background warm-up deduplicated. */
export const routeModules = {
  home: () => import("./home.js"),
  bible: () => import("./bible.js"),
  kidung: () => import("./kidung-page.js"),
  faith: () => import("./faith.js"),
  more: () => import("./more.js"),
  literature: () => import("./literature.js"),
  articles: () => import("./online-content.js"),
};
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
  const id = routes[path];
  if (!id) return Promise.resolve();
  if (!pending.has(id)) {
    const task = routeModules[id]()
      .then(async (module) => {
        if (id === "bible")
          await import("./bible-pack-loader.js").then((m) =>
            m.loadBundledBiblePack(),
          );
        if (id === "kidung")
          await Promise.all([
            import("./kidung-catalog.js"),
            import("./hymn-payloads.js").then((m) => m.loadCoreHymnMetadata()),
          ]);
        performance.mark(`gys-route-preloaded:${id}`);
        return module;
      })
      .catch((error) => {
        pending.delete(id);
        throw error;
      });
    pending.set(id, task);
  }
  return pending.get(id)!;
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
  const paths = ["/iman", "/kidung", "/bible", "/lainnya", "/", "/literatur"];
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
      idle = window.requestIdleCallback(run);
    else timer = window.setTimeout(run, 100);
  };
  timer = window.setTimeout(next, 200);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
