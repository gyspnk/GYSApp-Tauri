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
  // The reader paints from the per-book files, so warming the full 7,6 MB
  // shelf on hover would spend bandwidth the click does not need. Warm the
  // index and the first book instead; the full pack still starts after paint.
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

/** Warm only the first Bible chapter (index + one book, ~90 KiB) instead of
 * the 7.6 MB pack: a first visit then paints chapter 1 from cache while the
 * rest of the shelf still loads lazily. */
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
  let timer: number;
  let idle: number | undefined;
  // Order is the order people actually leave the home page: the two song and
  // reading destinations first, with the remaining sections behind them. A
  // click that lands before its route is warm pays for the chunk cascade
  // itself, so the first two entries matter more than the rest.
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
        .finally(() => {
          if (!cancelled) timer = window.setTimeout(next, 100);
        });
    };
    if (typeof window.requestIdleCallback === "function")
      idle = window.requestIdleCallback(run, { timeout: 1000 });
    else timer = window.setTimeout(run, 100);
  };
  // The first destination's payloads are what its first click actually waits
  // for. Warm them once the current page has finished loading, so the fetch
  // never competes with the page the reader is already looking at.
  // The Bible pack is 7.6 MB, so it is only warmed for readers who have
  // opened the Bible before: the first visit teaches us, and every visit after
  // it opens instantly without making every home page pay for the pack.
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
      .finally(() => {
        if (!cancelled) timer = window.setTimeout(warmPayloads, 300);
      });
  };
  const memory = (navigator as Navigator & { deviceMemory?: number })
    .deviceMemory;
  const payloadWarmAllowed =
    !/(^|-)2g$|(^|-)3g$/.test(connection?.effectiveType ?? "") &&
    (memory ?? 8) >= 4;
  if (payloadWarmAllowed && !visitedBible) {
    // First visit used to open the Bible cold (measured 1 183 ms). The chapter
    // itself is small, so it is warmed for everyone once the queue is warm.
    timer = window.setTimeout(() => {
      void warmBibleFirstChapter().catch(() => undefined);
    }, 1_500);
  }
  if (payloadWarmAllowed) {
    if (document.readyState === "complete")
      timer = window.setTimeout(warmPayloads, 150);
    else
      window.addEventListener(
        "load",
        () => {
          timer = window.setTimeout(warmPayloads, 150);
        },
        { once: true },
      );
  }
  timer = window.setTimeout(next, 200);
  return () => {
    cancelled = true;
    clearTimeout(timer);
    if (idle !== undefined) window.cancelIdleCallback(idle);
  };
}
