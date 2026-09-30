import { lazy, useEffect, useState } from "react";
import { useOutletContext, useParams, useSearchParams } from "react-router-dom";
import {
  UpstreamMusicLockSchema,
  type UpstreamMusicLock,
} from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
import { loadInstalledDistributedHymnCatalog } from "./distributed-hymnals.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";
import type { ShellTheme } from "./settings.js";
import { type CatalogState, parseCatalog } from "./kidung-shared.js";

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

function useHymnData(loadMusicLock: boolean) {
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [musicLock, setMusicLock] = useState<UpstreamMusicLock>();
  useEffect(() => {
    const controller = new AbortController();
    const load = () =>
      Promise.all([
        fetch(`${import.meta.env.BASE_URL}offline/hymn-catalog.json`, {
          signal: controller.signal,
          cache: "force-cache",
        }).then(async (response) => {
          if (!response.ok) throw new Error("Offline hymn catalog unavailable");
          return parseCatalog(await response.json());
        }),
        loadInstalledDistributedHymnCatalog(
          getDistributedAssetManager().getStore(),
        ).catch(() => []),
      ])
        .then(([core, distributed]) => {
          if (!controller.signal.aborted)
            setCatalog({ status: "ready", items: [...core, ...distributed] });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setCatalog({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Unable to load hymn catalog",
            });
        });
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
  }, []);
  useEffect(() => {
    if (!loadMusicLock) return;
    const controller = new AbortController();
    void fetch(`${import.meta.env.BASE_URL}offline/music-lock.json`, {
      cache: "force-cache",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("MIDI lock unavailable");
        const lock = UpstreamMusicLockSchema.parse(await response.json());
        if (!controller.signal.aborted) setMusicLock(lock);
      })
      .catch(() => {
        if (!controller.signal.aborted) setMusicLock(undefined);
      });
    return () => controller.abort();
  }, [loadMusicLock]);
  return { catalog, musicLock };
}

function KidungDataPage({ locale }: { locale: Locale }) {
  const { songId } = useParams();
  const [searchParams] = useSearchParams();
  const section = searchParams.get("section");
  const { catalog, musicLock } = useHymnData(
    Boolean(songId) || section !== "playlist",
  );
  if (!songId && section === "playlist")
    return <HymnPlaylistPage locale={locale} catalog={catalog} />;
  if (songId)
    return (
      <HymnDetail
        key={songId}
        locale={locale}
        songId={songId}
        state={catalog}
        {...(musicLock ? { musicLock } : {})}
      />
    );
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

  return <KidungDataPage locale={locale} />;
}
