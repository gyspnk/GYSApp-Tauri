import { loadMusicLock as loadPinnedMusicLock } from "./music-assets.js";
import { loadCoreHymns, loadCoreHymnMetadata } from "./hymn-payloads.js";
import { lazy, useEffect, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { type UpstreamMusicLock, type HymnMetadata } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { loadInstalledDistributedHymnCatalog } from "./distributed-hymnals.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";
import type { ShellTheme } from "./settings.js";
import {
  type CatalogState,
  parseCatalog,
  parseHymnMetadata,
} from "./kidung-shared.js";

type KidungShellContext = {
  locale?: Locale;
  theme?: ShellTheme;
  setLocale?: (locale: Locale) => void;
  setTheme?: (theme: ShellTheme) => void;
};

const HymnCatalog = lazy(() =>
  import("./kidung-catalog.js").then((module) => ({
    default: module.HymnCatalog,
  })),
);
const HymnDetail = lazy(() =>
  import("./kidung.js").then((module) => ({ default: module.HymnDetail })),
);
const HymnPlaylistPage = lazy(() =>
  import("./kidung-playlist-page.js").then((module) => ({
    default: module.HymnPlaylistPage,
  })),
);
const HymnSettingsPage = lazy(() =>
  import("./kidung-settings-page.js").then((module) => ({
    default: module.HymnSettingsPage,
  })),
);

// Retain the last successful catalog across reader/list navigation. Installed
// collections still refresh in the background and on asset-change events.
const catalogCache = new Map<() => Promise<HymnMetadata[]>, HymnMetadata[]>();

function useHymnData<T extends HymnMetadata>(
  loadMusicLock: boolean,
  loadCore: () => Promise<T[]>,
  parse: (value: unknown) => T[],
) {
  const [catalog, setCatalog] = useState<CatalogState<T>>(() => {
    const cached = catalogCache.get(loadCore) as T[] | undefined;
    return cached ? { status: "ready", items: cached } : { status: "loading" };
  });
  const [musicLock, setMusicLock] = useState<UpstreamMusicLock>();
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
            !catalogCache.has(loadCore)
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
  }, [loadCore, parse]);
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
  return { catalog, musicLock };
}

function KidungReaderDataPage({
  locale,
  songId,
}: {
  locale: Locale;
  songId: string;
}) {
  const { catalog, musicLock } = useHymnData(true, loadCoreHymns, parseCatalog);
  return (
    <HymnDetail
      key={songId}
      locale={locale}
      songId={songId}
      state={catalog}
      {...(musicLock ? { musicLock } : {})}
    />
  );
}

function KidungCatalogDataPage({
  locale,
  playlist,
}: {
  locale: Locale;
  playlist: boolean;
}) {
  const { catalog, musicLock } = useHymnData(
    !playlist,
    loadCoreHymnMetadata,
    parseHymnMetadata,
  );
  if (playlist) return <HymnPlaylistPage locale={locale} catalog={catalog} />;
  return (
    <HymnCatalog
      locale={locale}
      state={catalog}
      {...(musicLock ? { musicLock } : {})}
    />
  );
}

export function KidungPage({ locale }: { locale: Locale }) {
  const { songId } = useParams();
  const [searchParams] = useSearchParams();
  const shellContext = useOutletContext<KidungShellContext | undefined>();
  const section = searchParams.get("section");
  if (!songId && section === "settings")
    return (
      <HymnSettingsPage
        locale={locale}
        theme={shellContext?.theme ?? "light"}
        {...(shellContext?.setLocale
          ? { setLocale: shellContext.setLocale }
          : {})}
        {...(shellContext?.setTheme ? { setTheme: shellContext.setTheme } : {})}
      />
    );

  return songId ? (
    <KidungReaderDataPage locale={locale} songId={songId} />
  ) : (
    <KidungCatalogDataPage locale={locale} playlist={section === "playlist"} />
  );
}
