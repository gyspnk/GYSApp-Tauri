import { routeModules } from "./route-pages.js";
type RouteId = keyof typeof routeModules;
type PreloadOptions = {
  /** Warm only the route's code. Data packs stay lazy until the route is
   * actually opened or hovered, so background warming never parses a 7.6 MB
   * Bible pack on the main thread. */
  data?: boolean;
};

const codePending = new Map<RouteId, Promise<unknown>>();
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

function loadRouteCode(id: RouteId): Promise<unknown> {
  let pending = codePending.get(id);
  if (!pending) {
    pending = routeModules[id]().catch((error: unknown) => {
      codePending.delete(id);
      throw error;
    });
    codePending.set(id, pending);
  }
  return pending;
}

/** Data is not cached here: each loader owns its own request/validation cache
 * and must still run when a code-only warm already resolved. */
async function loadRouteData(id: RouteId): Promise<void> {
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
}

export function preloadRoute(
  path: string,
  { data = true }: PreloadOptions = {},
): Promise<unknown> {
  const pathname = path.split(/[?#]/)[0] ?? "/";
  const id = routes[pathname] ?? routes[`/${pathname.split("/")[1]}`];
  if (!id) return Promise.resolve();
  const route = loadRouteCode(id).then(async (module) => {
    if (data) await loadRouteData(id).catch(() => undefined);
    performance.mark(`gys-route-preloaded:${id}`);
    return module;
  });
  const withView =
    id === "kidung"
      ? Promise.all([
          route,
          import("./kidung-page.js").then((m) => m.preloadKidungView(path)),
        ])
      : route;
  return (pathname.startsWith("/literatur/") &&
    /[?&]read=1(?:&|$)/.test(path)) ||
    (pathname.startsWith("/kidung/") && /[?&]mode=pdf(?:&|$)/.test(path))
    ? Promise.all([
        withView,
        import("./pdf-reader-loader.js").then((m) => m.preloadPdfReader()),
      ])
    : withView;
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
      void preloadRoute(paths.shift()!, { data: false })
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
