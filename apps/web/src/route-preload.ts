import { routeModules } from "./route-pages.js";
type RouteId = keyof typeof routeModules;
type PreloadOptions = {
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

async function loadRouteData(id: RouteId): Promise<void> {
  if (id === "faith")
    await import("./faith-payloads.js").then((m) => m.loadFaithPack());
  if (id === "bible") await warmBibleFirstChapter();
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

const warmRoutes = new Set<string>();

function warmKey(path: string, data: boolean) {
  return `${data ? "data" : "code"}:${path.split(/[?#]/)[0] ?? "/"}`;
}

export function isRouteWarm(
  path: string,
  { data = true }: PreloadOptions = {},
): boolean {
  return (
    warmRoutes.has(warmKey(path, data)) && warmRoutes.has(warmKey(path, false))
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
  const settles =
    (pathname.startsWith("/literatur/") && /[?&]read=1(?:&|$)/.test(path)) ||
    (pathname.startsWith("/kidung/") && /[?&]mode=pdf(?:&|$)/.test(path))
      ? Promise.all([
          withView,
          import("./pdf-reader-loader.js").then((m) => m.preloadPdfReader()),
        ])
      : withView;
  return settles.then((value) => {
    warmRoutes.add(warmKey(path, false));
    if (data) warmRoutes.add(warmKey(path, true));
    return value;
  });
}

async function warmBibleFirstChapter(): Promise<void> {
  const [{ loadBibleBookIndex, bibleBookIndexUrl }, loader] = await Promise.all(
    [import("./bible-progressive-pack.js"), import("./bible-pack-loader.js")],
  );
  const index = await loadBibleBookIndex(
    bibleBookIndexUrl(import.meta.env.BASE_URL),
  );
  const first = index[0];
  if (first) await loader.loadBibleBookPack(first.id);
}

/** Warm sequentially after first paint, avoiding optional downloads and data-saving connections. */
export function warmNavigation(): () => void {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (
    connection?.saveData ||
    /(^|-)2g$/.test(connection?.effectiveType ?? "")
  ) {
    return () => {};
  }
  let cancelled = false;
  const timers = new Set<number>();
  let idle: number | undefined;
  const schedule = (fn: () => void, ms: number) => {
    if (cancelled) return;
    const id = window.setTimeout(() => {
      timers.delete(id);
      if (!cancelled) fn();
    }, ms);
    timers.add(id);
  };

  const paths = [
    "/kidung",
    "/bible",
    "/literatur",
    "/suara",
    "/lainnya",
    "/iman",
    "/",
  ];
  const next = () => {
    if (cancelled || !paths.length) return;
    const run = () => {
      if (cancelled) return;
      void preloadRoute(paths.shift()!, { data: false })
        .catch(() => undefined)
        .finally(() => schedule(next, 100));
    };
    if (typeof window.requestIdleCallback === "function")
      idle = window.requestIdleCallback(run, { timeout: 1000 });
    else schedule(run, 100);
  };

  const visitedBible = (() => {
    try {
      return window.localStorage.getItem("gys-bible-visited") === "1";
    } catch {
      return false;
    }
  })();
  const payloads = visitedBible ? ["/kidung", "/bible"] : ["/kidung"];
  const warmPayloads = () => {
    if (cancelled) return;
    const path = payloads.shift();
    if (!path) return;
    void preloadRoute(path, { data: true })
      .catch(() => undefined)
      .finally(() => schedule(warmPayloads, 300));
  };

  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const payloadWarmAllowed =
    !/(^|-)2g$|(^|-)3g$/.test(connection?.effectiveType ?? "") &&
    (memory ?? 8) >= 4;
  if (payloadWarmAllowed && !visitedBible) {
    schedule(() => {
      void warmBibleFirstChapter().catch(() => undefined);
    }, 1_500);
  }
  const onLoad = () => schedule(warmPayloads, 150);
  if (payloadWarmAllowed) {
    if (document.readyState === "complete") schedule(warmPayloads, 150);
    else window.addEventListener("load", onLoad, { once: true });
  }
  schedule(next, 200);
  return () => {
    cancelled = true;
    window.removeEventListener("load", onLoad);
    timers.forEach((id) => window.clearTimeout(id));
    timers.clear();
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
