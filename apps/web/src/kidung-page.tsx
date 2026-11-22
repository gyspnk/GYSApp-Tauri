import { loadMusicLock as loadPinnedMusicLock } from "./music-assets.js";
import {
  loadCoreHymns,
  loadCoreHymnMetadata,
  getCachedCoreHymnMetadata,
} from "./hymn-payloads.js";
import { useEffect, useRef, useState } from "react";
import { preloadable } from "./preloadable.js";
import {
  Navigate,
  useLocation,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { type UpstreamMusicLock, type HymnMetadata } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { loadInstalledDistributedHymnCatalog } from "./distributed-hymnals.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";
import {
  type CatalogState,
  parseCatalog,
  parseHymnMetadata,
} from "./kidung-shared.js";
import { readStoredCollection } from "./kidung-collection-store.js";
import { canonicalHymnId, splitHymnFallback } from "./kidung-ids.js";
import { KidungReaderRail } from "./kidung-reader-rail.js";

const HymnCatalog = preloadable(() =>
  import("./kidung-catalog.js").then((module) => ({
    default: module.HymnCatalog,
  })),
);
const HymnDetail = preloadable(() =>
  import("./kidung.js").then((module) => ({ default: module.HymnDetail })),
);
const HymnPlaylistPage = preloadable(() =>
  import("./kidung-playlist-page.js").then((module) => ({
    default: module.HymnPlaylistPage,
  })),
);
export const preloadKidungCatalog = HymnCatalog.preload;
export function preloadKidungView(path: string): Promise<unknown> {
  if (path.split(/[?#]/)[0]?.startsWith("/kidung/"))
    return Promise.all([HymnDetail.preload(), loadCoreHymns()]);
  const section = new URLSearchParams(path.split("?")[1]).get("section");
  return section === "playlist"
    ? HymnPlaylistPage.preload()
    : HymnCatalog.preload();
}

// Retain the last successful catalog across reader/list navigation. Installed
// collections still refresh in the background and on asset-change events.
const catalogCache = new Map<() => Promise<HymnMetadata[]>, HymnMetadata[]>();

function hasSavedBookIn(
  items: readonly HymnMetadata[],
  savedBook: string,
): boolean {
  return !savedBook || items.some((item) => item.book === savedBook);
}

function useHymnData<T extends HymnMetadata>(
  loadMusicLock: boolean,
  loadCore: () => Promise<T[]>,
  parse: (value: unknown) => T[],
) {
  const [catalog, setCatalog] = useState<CatalogState<T>>(() => {
    const cached = (catalogCache.get(loadCore) ??
      (loadCore === loadCoreHymnMetadata
        ? getCachedCoreHymnMetadata()
        : undefined)) as T[] | undefined;
    return cached && hasSavedBookIn(cached, readStoredCollection())
      ? { status: "ready", items: cached }
      : { status: "loading" };
  });
  const [musicLock, setMusicLock] = useState<UpstreamMusicLock>();
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let generation = 0;
    const load = () => {
      const current = ++generation;
      return Promise.all([
        loadCore().then((core) => {
          if (
            !controller.signal.aborted &&
            current === generation &&
            !catalogCache.has(loadCore) &&
            hasSavedBookIn(core, readStoredCollection())
          )
            setCatalog({ status: "ready", items: core });
          return core;
        }),
        loadInstalledDistributedHymnCatalog(
          getDistributedAssetManager().getStore(),
        ).catch(() => []),
      ])
        .then(([core, distributed]) => {
          if (!controller.signal.aborted && current === generation) {
            const items = [...core, ...parse({ items: distributed })];
            catalogCache.set(loadCore, items);
            setCatalog({ status: "ready", items });
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && current === generation)
            setCatalog({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to load hymn catalog",
            });
        });
    };
    void load();
    const onAssetsChanged = () => void load();
    window.addEventListener("gys-distributed-assets-change", onAssetsChanged);
    return () => {
      controller.abort();
      window.removeEventListener(
        "gys-distributed-assets-change",
        onAssetsChanged,
      );
    };
  }, [loadCore, parse, reload]);
  useEffect(() => {
    if (!loadMusicLock) return;
    const controller = new AbortController();
    void loadPinnedMusicLock()
      .then((lock) => {
        if (!controller.signal.aborted) setMusicLock(lock);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMusicLock(undefined);
      });
    return () => controller.abort();
  }, [loadMusicLock]);
  return {
    catalog,
    musicLock,
    retry: () => setReload((value) => value + 1),
  };
}

function readRailCollapsed(): boolean {
  try {
    return window.localStorage.getItem("gys-kidung-rail-collapsed") === "1";
  } catch {
    return false;
  }
}

function KidungReaderDataPage({
  locale,
  songId,
}: {
  locale: Locale;
  songId: string;
}) {
  const { catalog, musicLock, retry } = useHymnData(
    true,
    loadCoreHymns,
    parseCatalog,
  );
  const wide = useWideReader();
  const [railCollapsed, setRailCollapsed] = useState(readRailCollapsed);
  const [railTransitioning, setRailTransitioning] = useState(false);
  const railTransitionTimerRef = useRef<number | undefined>(undefined);
  const splitRef = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      if (railTransitionTimerRef.current !== undefined)
        window.clearTimeout(railTransitionTimerRef.current);
    },
    [],
  );
  const toggleRailCollapsed = () => {
    const next = !railCollapsed;
    const activeEl = document.activeElement;
    const fromToggle =
      next &&
      Boolean(
        activeEl &&
        splitRef.current
          ?.querySelector(".kidung-reader-rail")
          ?.contains(activeEl),
      );
    const fromExpand =
      !next && Boolean(activeEl?.classList.contains("kidung-rail-expand-btn"));
    if (railTransitionTimerRef.current !== undefined) {
      window.clearTimeout(railTransitionTimerRef.current);
      railTransitionTimerRef.current = undefined;
    }
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setRailTransitioning(true);
      railTransitionTimerRef.current = window.setTimeout(() => {
        setRailTransitioning(false);
        railTransitionTimerRef.current = undefined;
      }, 320);
    }
    setRailCollapsed(next);
    try {
      window.localStorage.setItem(
        "gys-kidung-rail-collapsed",
        next ? "1" : "0",
      );
    } catch {
      // Private mode: keep in-memory state only.
    }
    if (fromToggle) {
      window.requestAnimationFrame(() =>
        splitRef.current
          ?.querySelector<HTMLButtonElement>(".kidung-rail-expand-btn")
          ?.focus(),
      );
    } else if (fromExpand) {
      window.requestAnimationFrame(() =>
        splitRef.current
          ?.querySelector<HTMLButtonElement>(".kidung-rail-toggle")
          ?.focus(),
      );
    }
  };
  const split =
    catalog.status === "ready"
      ? splitHymnFallback(
          songId,
          catalog.items.map((item) => item.id),
        )
      : undefined;
  if (split) return <Navigate to={`/kidung/${split}`} replace />;
  if (catalog.status === "error")
    return (
      <div className="error-panel" role="alert">
        <strong>{translate(locale, "kidung.catalogUnavailable")}</strong>
        <span>{translate(locale, "common.errorBody")}</span>
        <button className="primary-button" type="button" onClick={retry}>
          {translate(locale, "home.retry")}
        </button>
      </div>
    );
  const detail = (
    <HymnDetail
      key={songId}
      locale={locale}
      songId={songId}
      state={catalog}
      {...(musicLock ? { musicLock } : {})}
      {...(wide && catalog.status === "ready"
        ? { railCollapsed, onToggleRail: toggleRailCollapsed }
        : {})}
    />
  );
  // Keep one stable tree around HymnDetail so rotating between narrow and
  // wide viewports (768x1024 <-> 1024x768) never remounts PDF/MIDI state.
  return (
    <div
      ref={splitRef}
      className={`kidung-reader-split${wide && catalog.status === "ready" && railCollapsed ? " is-rail-collapsed" : ""}${railTransitioning ? " is-rail-transitioning" : ""}`}
      onTransitionEnd={(event) => {
        if (
          event.target === splitRef.current &&
          event.propertyName === "grid-template-columns"
        ) {
          setRailTransitioning(false);
          if (railTransitionTimerRef.current !== undefined) {
            window.clearTimeout(railTransitionTimerRef.current);
            railTransitionTimerRef.current = undefined;
          }
        }
      }}
    >
      {wide && catalog.status === "ready" && (
        <KidungReaderRail
          locale={locale}
          state={catalog}
          activeId={songId}
          collapsed={railCollapsed}
          onCollapse={toggleRailCollapsed}
        />
      )}
      <div className="kidung-reader-pane">{detail}</div>
    </div>
  );
}

function useWideReader() {
  const query =
    "(min-width: 1200px), (min-width: 1024px) and (orientation: landscape)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    const sync = () => setWide(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return wide;
}

function KidungCatalogDataPage({
  locale,
  playlist,
}: {
  locale: Locale;
  playlist: boolean;
}) {
  const { catalog, musicLock, retry } = useHymnData(
    !playlist,
    loadCoreHymnMetadata,
    parseHymnMetadata,
  );
  if (playlist) return <HymnPlaylistPage locale={locale} catalog={catalog} />;
  return (
    <HymnCatalog
      locale={locale}
      state={catalog}
      onRetry={retry}
      {...(musicLock ? { musicLock } : {})}
    />
  );
}

export function KidungPage({ locale }: { locale: Locale }) {
  const { songId } = useParams();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section");
  // Remember the visit: the chord cache is only verified on startup for a
  // reader who has actually opened the songbook (see App.tsx).
  useEffect(() => {
    try {
      window.localStorage.setItem("gys-kidung-visited", "1");
    } catch {
      // Private mode: the startup sync simply stays off.
    }
  }, []);
  if (!songId && section === "settings")
    return <Navigate to="/lainnya?section=kidung" replace />;
  const canonical = songId ? canonicalHymnId(songId) : undefined;
  if (canonical && canonical !== songId)
    return <Navigate to={`/kidung/${canonical}${location.search}`} replace />;

  return songId ? (
    <KidungReaderDataPage locale={locale} songId={songId} />
  ) : (
    <KidungCatalogDataPage locale={locale} playlist={section === "playlist"} />
  );
}
