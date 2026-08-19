import {
  lazy,
  Suspense,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  Link,
  useNavigate,
  useOutletContext,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  HymnCatalogEntrySchema,
  UpstreamMusicLockSchema,
  type ChordDocumentV2,
  type HymnCatalogEntry,
  type UpstreamMusicLock,
} from "@gys/contracts";
import { MidiLoader } from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import { createBrowserChordRepository } from "./chords.js";
import {
  ChordCapability,
  chordKeyIndex,
  chordKeyName,
  inferChordDocumentKey,
  matchChordLinesToLyrics,
  transposeBetweenKeys,
  transposeChord,
} from "./chord-viewer.js";
import type { ChordLayoutPage } from "./chord-layout-pdf.js";
import type { PdfChordOverlayMarker } from "./pdf.js";
import {
  downloadMusicAsset,
  findMusicAsset,
  loadMusicAsset,
  resolveMusicAssetUrl,
} from "./music-assets.js";
import { midiPlayer } from "./midi-player.js";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import { speechPlayer } from "./speech-player.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";
import { isFavorite, subscribeFavorites, toggleFavorite } from "./favorites.js";
import { getActivity, setHymnActivity } from "./history.js";
import { loadForkHymnalPdf } from "./fork-pdf.js";
import {
  loadInstalledDistributedHymnCatalog,
  loadInstalledDistributedHymnalPdf,
} from "./distributed-hymnals.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";
import { buildHymnSearchIndex, searchHymns } from "./hymn-search.js";
import {
  addMidiPlaylistItem,
  clearMidiPlaylist,
  downloadMidiPlaylist,
  getMidiPlaylist,
  importMidiPlaylist,
  moveMidiPlaylistItem,
  removeMidiPlaylistItem,
  selectMidiPlaylistItem,
  subscribeMidiPlaylist,
  updateMidiPlaylistOptions,
} from "./midi-playlist.js";
import { playMidiPlaylistItem } from "./midi-queue.js";
import { hapticTick } from "./haptics.js";
import {
  readHymnViewerMode,
  readHymnChordVisibility,
  type HymnViewerMode,
  writeHymnChordVisibility,
  writeHymnViewerMode,
} from "./hymn-view-mode.js";
import {
  DEFAULT_HYMN_TYPOGRAPHY,
  readHymnTypography,
  writeHymnTypography,
  type HymnTypography,
} from "./hymn-preferences.js";
import { autoFitFontSize } from "./hymn-autofit.js";
import type { ShellTheme } from "./settings.js";

type KidungShellContext = {
  locale?: Locale;
  theme?: ShellTheme;
  setLocale?: (locale: Locale) => void;
  setTheme?: (theme: ShellTheme) => void;
};

const PdfReader = lazy(() =>
  import("./pdf.js").then(({ PdfReader: Component }) => ({
    default: Component,
  })),
);
type CatalogState =
  | { status: "loading" }
  | { status: "ready"; items: HymnCatalogEntry[] }
  | { status: "error"; message: string };
type HymnPdfAsset = {
  src: string;
  bytes?: Uint8Array;
  initialPage: number;
  pageCount?: number;
  source: "fork" | "canonical" | "distributed";
  sourceVersion: string;
};
const parsedLyricsCache = new Map<string, string[]>();

function getHymnVerses(item: HymnCatalogEntry | undefined): string[] {
  if (!item) return [];
  const key = `${item.id}:${item.lyrics.length}:${item.verses.length}`;
  const cached = parsedLyricsCache.get(key);
  if (cached) return cached;
  const verses = item.verses.length
    ? item.verses
    : item.lyrics.split(/\n\s*\n/).filter(Boolean);
  parsedLyricsCache.set(key, verses);
  while (parsedLyricsCache.size > 96)
    parsedLyricsCache.delete(parsedLyricsCache.keys().next().value as string);
  return verses;
}

function parseCatalog(value: unknown): HymnCatalogEntry[] {
  if (
    !value ||
    typeof value !== "object" ||
    !Array.isArray((value as { items?: unknown }).items)
  )
    throw new Error("Hymn catalog is invalid");
  return (value as { items: unknown[] }).items.map((item) =>
    HymnCatalogEntrySchema.parse(item),
  );
}

function useHymnData() {
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
    void fetch(`${import.meta.env.BASE_URL}offline/music-lock.json`, {
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("MIDI lock unavailable");
        setMusicLock(UpstreamMusicLockSchema.parse(await response.json()));
      })
      .catch(() => setMusicLock(undefined));
  }, []);
  return { catalog, musicLock };
}

function numberLabel(number: number) {
  return String(number).padStart(3, "0");
}
function uniqueItems(items: HymnCatalogEntry[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.assetCode ?? item.book}:${item.number}:${item.title.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function KidungPage({ locale }: { locale: Locale }) {
  const { songId } = useParams();
  const [searchParams] = useSearchParams();
  const shellContext = useOutletContext<KidungShellContext | undefined>();
  const { catalog, musicLock } = useHymnData();
  const section = searchParams.get("section");
  if (!songId && section === "playlist")
    return <HymnPlaylistPage locale={locale} />;
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
  return <HymnCatalog locale={locale} state={catalog} />;
}

type KidungSection = "songs" | "playlist" | "settings";

function KidungLocalNav({ active }: { active: KidungSection }) {
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const links: Array<{ id: KidungSection; label: string; to: string }> = [
    { id: "songs", label: "Kidung", to: "/kidung" },
    {
      id: "playlist",
      label: "Playlist",
      to: "/kidung?section=playlist",
    },
    {
      id: "settings",
      label: "Pengaturan",
      to: "/kidung?section=settings",
    },
  ];
  return (
    <nav className="kidung-local-nav" aria-label="Navigasi Kidung">
      <div className="kidung-local-nav-links">
        {links.map((link) => (
          <Link
            className={active === link.id ? "is-active" : undefined}
            key={link.id}
            to={link.to}
            aria-current={active === link.id ? "page" : undefined}
          >
            <span>{link.label}</span>
            {link.id === "playlist" && playlist.items.length > 0 && (
              <small>{playlist.items.length}</small>
            )}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function HymnPlaylistPage({ locale }: { locale: Locale }) {
  const navigate = useNavigate();
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importError, setImportError] = useState<string>();

  const importPlaylist = async (file: File | undefined) => {
    if (!file) return;
    try {
      importMidiPlaylist(await file.text());
      setImportError(undefined);
    } catch {
      setImportError("File playlist tidak dapat dibaca.");
    }
  };

  return (
    <div className="page hymn-page kidung-tool-page">
      <KidungLocalNav active="playlist" />
      <header className="kidung-tool-heading">
        <div>
          <h1>Playlist</h1>
        </div>
        <div className="kidung-tool-heading-actions">
          <button
            className="text-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Impor
          </button>
          <button
            className="text-button"
            type="button"
            onClick={() => downloadMidiPlaylist()}
            disabled={playlist.items.length === 0}
          >
            Ekspor
          </button>
          <input
            ref={fileInputRef}
            className="sr-only"
            type="file"
            accept="application/json,.json"
            onChange={(event) => {
              void importPlaylist(event.target.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </header>
      <section className="kidung-queue-surface" aria-label="Playlist MIDI">
        <div className="kidung-queue-options">
          <label className="kidung-inline-toggle">
            <input
              type="checkbox"
              checked={playlist.autoNext}
              onChange={(event) =>
                updateMidiPlaylistOptions({ autoNext: event.target.checked })
              }
            />
            <span>Putar berikutnya otomatis</span>
          </label>
          <label className="kidung-inline-toggle">
            <input
              type="checkbox"
              checked={playlist.shuffle}
              onChange={(event) =>
                updateMidiPlaylistOptions({ shuffle: event.target.checked })
              }
            />
            <span>Acak urutan</span>
          </label>
          <Select
            value={playlist.loop}
            onChange={(loop) => updateMidiPlaylistOptions({ loop })}
            label="Ulangi"
            options={[
              { value: "off", label: "Tidak mengulang" },
              { value: "one", label: "Lagu ini" },
              { value: "all", label: "Semua lagu" },
            ]}
          />
          <button
            className="text-button kidung-clear-playlist"
            type="button"
            onClick={() => clearMidiPlaylist()}
            disabled={playlist.items.length === 0}
          >
            Kosongkan
          </button>
        </div>
        {importError && (
          <p className="kidung-inline-error" role="alert">
            {importError}
          </p>
        )}
        {playlist.items.length === 0 ? (
          <div className="kidung-empty-state">
            <strong>Playlist masih kosong.</strong>
            <p>
              Tambahkan lagu dari detail Kidung, lalu putar dan atur urutannya
              di sini.
            </p>
            <Link className="text-button" to="/kidung">
              Kembali ke daftar Kidung →
            </Link>
          </div>
        ) : (
          <ol className="kidung-playlist-list">
            {playlist.items.map((item, index) => (
              <li
                className={
                  index === playlist.currentIndex ? "is-current" : undefined
                }
                key={item.songId}
              >
                <button
                  className="kidung-playlist-song"
                  type="button"
                  onClick={() => {
                    selectMidiPlaylistItem(index);
                    void playMidiPlaylistItem(item.songId).catch(
                      () => undefined,
                    );
                  }}
                >
                  <span className="kidung-playlist-index">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>
                      {index === playlist.currentIndex
                        ? "Sedang dipilih"
                        : "Siap diputar"}
                    </small>
                  </span>
                </button>
                <div className="kidung-playlist-actions">
                  <button
                    className="text-button"
                    type="button"
                    aria-label={`Naikkan ${item.title}`}
                    onClick={() => moveMidiPlaylistItem(index, index - 1)}
                    disabled={index === 0}
                  >
                    Naik
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    aria-label={`Turunkan ${item.title}`}
                    onClick={() => moveMidiPlaylistItem(index, index + 1)}
                    disabled={index === playlist.items.length - 1}
                  >
                    Turun
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    aria-label={`Hapus ${item.title} dari playlist`}
                    onClick={() => removeMidiPlaylistItem(item.songId)}
                  >
                    Hapus
                  </button>
                  <button
                    className="text-button kidung-open-song"
                    type="button"
                    onClick={() => navigate(`/kidung/${item.songId}`)}
                  >
                    Buka
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function HymnSettingsPage({
  locale,
  theme,
  setLocale,
  setTheme,
}: {
  locale: Locale;
  theme: ShellTheme;
  setLocale?: (locale: Locale) => void;
  setTheme?: (theme: ShellTheme) => void;
}) {
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const [compactPlayer, setCompactPlayer] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("gys-media-minimized") === "1",
  );
  const setPlayerPreference = (next: boolean) => {
    setCompactPlayer(next);
    if (typeof window !== "undefined") {
      localStorage.setItem("gys-media-minimized", next ? "1" : "0");
      window.dispatchEvent(new Event("gys-media-preference-change"));
    }
  };
  return (
    <div className="page hymn-page kidung-tool-page">
      <KidungLocalNav active="settings" />
      <header className="kidung-tool-heading">
        <div>
          <h1>Pengaturan</h1>
        </div>
      </header>
      <div className="kidung-settings-layout">
        <section
          className="kidung-settings-section"
          aria-labelledby="kidung-appearance-heading"
        >
          <p className="date-line">Tampilan</p>
          <h2 id="kidung-appearance-heading">Bahasa dan tema</h2>
          <div className="kidung-settings-controls">
            <Select
              value={locale}
              onChange={(value) => setLocale?.(value)}
              label="Bahasa"
              options={[
                { value: "id", label: "Indonesia" },
                { value: "en", label: "English" },
                { value: "zh", label: "中文" },
              ]}
              disabled={!setLocale}
            />
            <Select
              value={theme}
              onChange={(value) => setTheme?.(value)}
              label="Tema"
              options={[
                { value: "light", label: "Terang" },
                { value: "dark", label: "Gelap" },
                { value: "system", label: "Sistem" },
                { value: "sepia", label: "Sepia" },
                { value: "amoled", label: "AMOLED" },
              ]}
              disabled={!setTheme}
            />
          </div>
        </section>
        <section
          className="kidung-settings-section"
          aria-labelledby="kidung-player-heading"
        >
          <p className="date-line">Audio</p>
          <h2 id="kidung-player-heading">Pemutar MIDI</h2>
          <label className="kidung-settings-switch">
            <input
              type="checkbox"
              checked={compactPlayer}
              onChange={(event) => setPlayerPreference(event.target.checked)}
            />
            <span>
              <strong>Mulai dalam mode ringkas</strong>
              <small>
                Player tetap tersedia sebagai dock tipis dan dapat dibuka kapan
                saja.
              </small>
            </span>
          </label>
          <div className="kidung-settings-summary">
            <span>Playlist tersimpan</span>
            <strong>{playlist.items.length} lagu</strong>
          </div>
          <Link className="text-button" to="/kidung?section=playlist">
            Kelola playlist →
          </Link>
        </section>
      </div>
    </div>
  );
}

function HymnCatalog({
  locale,
  state,
}: {
  locale: Locale;
  state: CatalogState;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [book, setBook] = useState("all");
  const deferredQuery = useDeferredValue(query);
  const allItems = useMemo(
    () => (state.status === "ready" ? uniqueItems(state.items) : []),
    [state],
  );
  const searchIndex = useMemo(() => buildHymnSearchIndex(allItems), [allItems]);
  const books = useMemo(
    () => [...new Set(allItems.map((item) => item.book))].sort(),
    [allItems],
  );
  const filtered = useMemo(() => {
    if (!deferredQuery.trim() && book === "all")
      return allItems.filter((item) => !item.assetCode);
    return searchHymns(searchIndex, deferredQuery, book);
  }, [allItems, book, deferredQuery, searchIndex]);
  return (
    <div className="page hymn-page">
      <KidungLocalNav active="songs" />
      <header className="hymn-page-header">
        <div className="hymn-page-heading">
          <h1>{translate(locale, "page.kidungTitle")}</h1>
        </div>
        {state.status === "ready" && (
          <div className="catalog-toolbar hymn-catalog-controls">
            <label className="search-field">
              <span>{translate(locale, "kidung.search")}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={translate(locale, "kidung.searchPlaceholder")}
              />
            </label>
            <Select
              value={book}
              onChange={setBook}
              label={translate(locale, "kidung.collection")}
              options={[
                {
                  value: "all",
                  label: translate(locale, "kidung.allCollections"),
                },
                ...books.map((value) => ({ value, label: value })),
              ]}
            />
          </div>
        )}
      </header>
      {state.status === "loading" && (
        <div className="loading-panel" role="status">
          {translate(locale, "kidung.catalogLoading")}
        </div>
      )}
      {state.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "kidung.catalogUnavailable")}</strong>
          <span>{state.message}</span>
        </div>
      )}
      {state.status === "ready" && (
        <section className="hymn-catalog-shell">
          <ol className="pujian-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="pujian-row"
                  onClick={() => navigate(`/kidung/${item.id}`)}
                >
                  <span className="pujian-number" aria-hidden="true">
                    {numberLabel(item.number)}
                  </span>
                  <span className="pujian-copy">
                    <strong>{item.title}</strong>
                    <span className="pujian-meta">
                      <span>{item.book}</span>
                      <span>{item.verses.length} bait</span>
                      <span className="pujian-badge">
                        {item.chordRef ? "Chord" : "Lirik"}
                      </span>
                      {item.pdfPath && (
                        <span className="pujian-badge is-muted">
                          {item.assetCode
                            ? "PDF paket opsional"
                            : `PDF ${translate(locale, "kidung.pdfAvailable")}`}
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="pujian-row-action">
                    <span className="pujian-row-action-label">Buka</span>
                    <span className="pujian-arrow" aria-hidden="true">
                      ›
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function HymnDetail({
  locale,
  songId,
  state,
  musicLock,
}: {
  locale: Locale;
  songId: string;
  state: CatalogState;
  musicLock?: UpstreamMusicLock;
}) {
  const navigate = useNavigate();
  const item =
    state.status === "ready"
      ? state.items.find((candidate) => candidate.id === songId)
      : undefined;
  const [verseIndex, setVerseIndex] = useState(() => {
    const last = getActivity().hymn;
    return last?.id === songId ? Math.max(0, last.verseIndex) : 0;
  });
  const [transpose, setTranspose] = useState(
    () => midiPlayer.settingsSnapshot().transpose,
  );
  const transposeRef = useRef(transpose);
  const [sourceKeyIndex, setSourceKeyIndex] = useState(0);
  const [keyIndex, setKeyIndex] = useState(() => {
    const initialTranspose = midiPlayer.settingsSnapshot().transpose;
    return ((initialTranspose % 12) + 12) % 12;
  });
  const [accidental, setAccidental] = useState<"sharp" | "flat">("sharp");
  const [typography, setTypography] = useState<HymnTypography>(() =>
    readHymnTypography(songId),
  );
  const [chordStatus, setChordStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [chordDocument, setChordDocument] = useState<ChordDocumentV2>();
  const [chordLayout, setChordLayout] = useState<ChordLayoutPage[]>([]);
  const [chordOverlays, setChordOverlays] = useState<
    Record<string, PdfChordOverlayMarker[]>
  >({});
  const [chordsVisible, setChordsVisible] = useState(() =>
    readHymnChordVisibility(songId),
  );
  const [midiStatus, setMidiStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [soundfontInstalled, setSoundfontInstalled] = useState(false);
  const [viewerMode, setViewerMode] = useState<HymnViewerMode>(() =>
    readHymnViewerMode(songId),
  );
  const [pdfUrl, setPdfUrl] = useState<string>();
  const [pdfBytes, setPdfBytes] = useState<Uint8Array>();
  const [pdfInitialPage, setPdfInitialPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState<number>();
  const [pdfSource, setPdfSource] = useState<
    "fork" | "canonical" | "distributed"
  >("fork");
  const [pdfVersion, setPdfVersion] = useState<string>();
  const [pdfStatus, setPdfStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [notice, setNotice] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [playlist, setPlaylist] = useState(() => getMidiPlaylist());
  const gesturePointers = useRef(new Map<number, { x: number; y: number }>());
  const swipeStart = useRef<{ x: number; y: number; time: number } | undefined>(
    undefined,
  );
  const pinchStart = useRef<
    | {
        distance: number;
        fontSize: number;
        nextFontSize: number;
      }
    | undefined
  >(undefined);
  const [gestureActive, setGestureActive] = useState(false);
  const [transitionDirection, setTransitionDirection] = useState<
    "previous" | "next"
  >("next");
  const autoLoadedSong = useRef<string | undefined>(undefined);
  const keyInitialized = useRef(false);
  const chordRun = useRef(0);
  const chordAbort = useRef<AbortController | undefined>(undefined);
  const pdfRun = useRef(0);
  const pdfAssetPromise = useRef<Promise<HymnPdfAsset> | undefined>(undefined);
  const preloadRun = useRef(0);
  const chordRepository = useMemo(createBrowserChordRepository, []);
  const midiLoader = useMemo(() => new MidiLoader(), []);
  const lyricsRef = useRef<HTMLElement>(null);
  const [fitFontSize, setFitFontSize] = useState(
    () => readHymnTypography(songId).fontSize,
  );
  const midiSettings = useSyncExternalStore(
    midiPlayer.subscribeSettings,
    midiPlayer.settingsSnapshot,
    midiPlayer.settingsSnapshot,
  );
  const midiState = useSyncExternalStore(
    midiPlayer.subscribe,
    midiPlayer.snapshot,
    midiPlayer.snapshot,
  );
  const midiAvailable = !item?.assetCode && soundfontInstalled;
  const verses = getHymnVerses(item);
  const safeVerseIndex = Math.min(verseIndex, Math.max(0, verses.length - 1));
  const sequence = state.status === "ready" ? uniqueItems(state.items) : [];
  const index = item
    ? sequence.findIndex((candidate) => candidate.id === item.id)
    : -1;
  const prev = index > 0 ? sequence[index - 1] : undefined;
  const next = index >= 0 ? sequence[index + 1] : undefined;
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getDistributedAssetManager()
        .getStore()
        .hasCachedPayload("GeneralUser-GS")
        .then((installed) => active && setSoundfontInstalled(installed));
    };
    refresh();
    window.addEventListener("gys-distributed-assets-change", refresh);
    return () => {
      active = false;
      window.removeEventListener("gys-distributed-assets-change", refresh);
    };
  }, []);
  useEffect(() => {
    if (item)
      setHymnActivity(
        { id: item.id, title: item.title, number: item.number },
        safeVerseIndex,
      );
  }, [item, safeVerseIndex]);
  useEffect(() => {
    setTypography(readHymnTypography(songId));
    setFitFontSize(readHymnTypography(songId).fontSize);
    setSourceKeyIndex(0);
    setKeyIndex(((midiPlayer.settingsSnapshot().transpose % 12) + 12) % 12);
    keyInitialized.current = false;
  }, [songId]);
  useEffect(() => {
    transposeRef.current = transpose;
  }, [transpose]);
  useEffect(() => {
    if (midiSettings.transpose !== transpose) {
      transposeRef.current = midiSettings.transpose;
      setTranspose(midiSettings.transpose);
      setKeyIndex((((sourceKeyIndex + midiSettings.transpose) % 12) + 12) % 12);
    }
  }, [midiSettings.transpose, sourceKeyIndex, transpose]);
  useEffect(() => {
    if (!item) return;
    setFavorite(isFavorite("hymn", item.id));
    return subscribeFavorites(() => setFavorite(isFavorite("hymn", item.id)));
  }, [item]);
  useEffect(
    () => subscribeMidiPlaylist(() => setPlaylist(getMidiPlaylist())),
    [],
  );
  useEffect(
    () => () => {
      chordRun.current += 1;
      chordAbort.current?.abort();
      pdfRun.current += 1;
      preloadRun.current += 1;
    },
    [],
  );
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);
  useEffect(() => {
    if (
      !item ||
      !musicLock ||
      !soundfontInstalled ||
      typeof navigator === "undefined" ||
      !navigator.onLine
    )
      return;
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean; effectiveType?: string };
      }
    ).connection;
    if (connection?.saveData || connection?.effectiveType === "2g") return;
    const run = ++preloadRun.current;
    const candidates = [prev, next].filter(
      (candidate): candidate is HymnCatalogEntry => Boolean(candidate),
    );
    for (const candidate of candidates) {
      void chordRepository.getChord(candidate.id).catch(() => undefined);
      const ref = findMusicAsset(musicLock, "midi", candidate.midiPath);
      if (!ref) continue;
      // Both directions get the complete warm path: binary -> parser -> PCM.
      // MidiLoader and loadMusicAsset both deduplicate by immutable hash, so
      // this never creates a second network request when the user taps play.
      void (async () => {
        try {
          const bytes = await loadMusicAsset(ref);
          if (run !== preloadRun.current) return;
          const loaded = await midiLoader.load({
            id: candidate.id,
            url: `https://raw.githubusercontent.com/gyspnk/gyschordweb/${musicLock.sourceCommit}/docs/${ref.path}`,
            sourceHash: ref.sha256,
            bytes,
          });
          if (run !== preloadRun.current) return;
          await midiPlayer.preload({
            songId: candidate.id,
            title: candidate.title,
            midi: loaded.midi,
            rawMidi: bytes,
            sourceHash: ref.sha256,
            tempo: midiSettings.tempo,
            transpose: midiSettings.transpose,
            instrument: midiSettings.instrument,
          });
        } catch {
          // Neighbor warm-up is an opportunistic optimisation. The foreground
          // load still reports the actionable error if the user selects it.
        }
      })();
    }
    return () => {
      if (preloadRun.current === run) preloadRun.current += 1;
    };
  }, [
    chordRepository,
    item,
    midiLoader,
    midiSettings.instrument,
    midiSettings.tempo,
    midiSettings.transpose,
    musicLock,
    next,
    prev,
    soundfontInstalled,
  ]);
  useEffect(() => {
    if (!item || autoLoadedSong.current === item.id) return;
    autoLoadedSong.current = item.id;
    const saved = readHymnViewerMode(item.id);
    if (saved === "pdf" && pdfStatus === "idle") void loadPdf();
    if (chordsVisible && chordStatus === "idle") void loadChord();
  }, [item, chordStatus, chordsVisible, pdfStatus]);
  const lyricLines = (verses[safeVerseIndex] ?? "").split("\n");
  const lyricText = lyricLines.join("\n");
  const chordLines = useMemo(
    () =>
      matchChordLinesToLyrics(
        lyricLines,
        chordDocument,
        chordLayout,
        safeVerseIndex,
      ),
    [chordDocument, chordLayout, safeVerseIndex, lyricText],
  );
  useLayoutEffect(() => {
    if (viewerMode !== "lyrics") return;
    const element = lyricsRef.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // Measure against the user's preferred size first. The resulting
      // bounded value is then applied by React, avoiding an oscillating
      // resize loop when a chord marker wraps at a smaller size.
      element.style.fontSize = `${typography.fontSize}px`;
      const next = autoFitFontSize({
        preferredFontSize: typography.fontSize,
        availableWidth: element.clientWidth,
        measuredWidth: element.scrollWidth,
      });
      element.style.fontSize = `${next}px`;
      setFitFontSize((current) => (current === next ? current : next));
    };
    const schedule = () => {
      if (frame) return;
      frame =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame(measure)
          : window.setTimeout(measure, 0);
    };
    schedule();
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(schedule)
        : undefined;
    observer?.observe(element);
    window.addEventListener("resize", schedule, { passive: true });
    window.visualViewport?.addEventListener("resize", schedule, {
      passive: true,
    });
    return () => {
      if (frame) {
        if (typeof window.cancelAnimationFrame === "function")
          window.cancelAnimationFrame(frame);
        else window.clearTimeout(frame);
      }
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      window.visualViewport?.removeEventListener("resize", schedule);
    };
  }, [
    accidental,
    chordDocument,
    chordLayout,
    chordsVisible,
    lyricText,
    safeVerseIndex,
    transpose,
    typography.fontSize,
    typography.lineHeight,
    viewerMode,
  ]);
  const pdfChordOverlays = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(chordOverlays).map(([page, markers]) => [
          page,
          markers.map((marker) => ({
            ...marker,
            chord: transposeChord(marker.chord, transpose, accidental),
          })),
        ]),
      ),
    [accidental, chordOverlays, transpose],
  );
  const musicMidiRef = musicLock
    ? findMusicAsset(musicLock, "midi", item?.midiPath ?? "")
    : undefined;
  const musicPdfRef = musicLock
    ? findMusicAsset(musicLock, "pdf", item?.pdfPath ?? "")
    : undefined;
  if (state.status === "loading")
    return (
      <div className="page">
        <div className="loading-panel" role="status">
          {translate(locale, "kidung.catalogLoading")}
        </div>
      </div>
    );
  if (state.status === "error" || !item)
    return (
      <div className="page">
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "kidung.notFound")}</strong>
          <Link className="quiet-button" to="/kidung">
            {translate(locale, "kidung.back")}
          </Link>
        </div>
      </div>
    );
  const show = (message: string) => {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  };
  const toggle = () => {
    if (!item) return;
    hapticTick("medium");
    const next = toggleFavorite({
      kind: "hymn",
      id: item.id,
      title: item.title,
    });
    setFavorite(next);
    show(
      next
        ? translate(locale, "kidung.favoriteSaved")
        : translate(locale, "kidung.favoriteRemoved"),
    );
  };

  const changeVerse = (delta: -1 | 1) => {
    const target = safeVerseIndex + delta;
    setTransitionDirection(delta > 0 ? "next" : "previous");
    hapticTick("light");
    if (target >= 0 && target < verses.length) {
      setVerseIndex(target);
      return;
    }
    const song = delta > 0 ? next : prev;
    if (song) navigate(`/kidung/${song.id}`);
  };
  const pointerDistance = () => {
    const points = [...gesturePointers.current.values()];
    const first = points[0];
    const second = points[1];
    return first && second
      ? Math.hypot(second.x - first.x, second.y - first.y)
      : 0;
  };
  const onLyricsPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType !== "touch") return;
    gesturePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic accessibility tests do not register a native pointer.
    }
    if (gesturePointers.current.size === 1) {
      swipeStart.current = {
        x: event.clientX,
        y: event.clientY,
        time: Date.now(),
      };
    } else if (gesturePointers.current.size === 2) {
      const distance = pointerDistance();
      pinchStart.current = {
        distance,
        fontSize: typography.fontSize,
        nextFontSize: typography.fontSize,
      };
      swipeStart.current = undefined;
      setGestureActive(true);
    }
  };
  const onLyricsPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!gesturePointers.current.has(event.pointerId)) return;
    gesturePointers.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pinch = pinchStart.current;
    if (!pinch || gesturePointers.current.size < 2 || pinch.distance <= 0)
      return;
    event.preventDefault();
    const nextFontSize = Math.max(
      16,
      Math.min(28, pinch.fontSize * (pointerDistance() / pinch.distance)),
    );
    pinch.nextFontSize = Math.round(nextFontSize * 10) / 10;
    setFitFontSize(pinch.nextFontSize);
  };
  const finishLyricsPointer = (event: ReactPointerEvent<HTMLElement>) => {
    const wasPinching = Boolean(pinchStart.current);
    const start = swipeStart.current;
    gesturePointers.current.delete(event.pointerId);
    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId))
        event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The browser can release a touch pointer before React receives cancel.
    }
    if (wasPinching) {
      if (gesturePointers.current.size < 2) {
        const nextFontSize = pinchStart.current?.nextFontSize;
        pinchStart.current = undefined;
        setGestureActive(false);
        if (nextFontSize !== undefined)
          setTypography((current) =>
            writeHymnTypography(item.id, {
              ...current,
              fontSize: nextFontSize,
            }),
          );
      }
      return;
    }
    swipeStart.current = undefined;
    if (!start) return;
    const deltaX = event.clientX - start.x;
    const deltaY = event.clientY - start.y;
    if (
      Math.abs(deltaX) >= 56 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.35 &&
      Date.now() - start.time < 650
    )
      changeVerse(deltaX < 0 ? 1 : -1);
  };
  /**
   * Resolve the exact PDF resource used by every presentation in this hymn.
   * Chord extraction and the visible PDF used to race independently: a Fork
   * failure could leave the chord layer mapped to the master while the reader
   * had already fallen back to the canonical per-song PDF. Sharing this
   * immutable request makes the resource/version boundary explicit and keeps
   * both modes on the same page geometry.
   */
  const loadPdfAsset = (): Promise<HymnPdfAsset> => {
    const existing = pdfAssetPromise.current;
    if (existing) return existing;
    const request = (async () => {
      if (item.assetCode && item.assetCode !== "KR") {
        const distributedPdf = await loadInstalledDistributedHymnalPdf(
          item,
          getDistributedAssetManager().getStore(),
        );
        return {
          ...distributedPdf,
          source: "distributed" as const,
        } satisfies HymnPdfAsset;
      }
      let forkError: unknown;
      try {
        const forkPdf = await loadForkHymnalPdf(item.id);
        return {
          src: forkPdf.src,
          initialPage: forkPdf.initialPage,
          pageCount: forkPdf.pageCount,
          source: "fork" as const,
          sourceVersion: forkPdf.sourceVersion,
        } satisfies HymnPdfAsset;
      } catch (error) {
        forkError = error;
      }
      if (!musicPdfRef) throw forkError ?? new Error("PDF unavailable");
      const src = await resolveMusicAssetUrl(musicPdfRef, musicLock);
      return {
        src,
        initialPage: 1,
        source: "canonical" as const,
        sourceVersion: musicPdfRef.sha256,
      } satisfies HymnPdfAsset;
    })();
    pdfAssetPromise.current = request;
    void request.catch(() => {
      if (pdfAssetPromise.current === request)
        pdfAssetPromise.current = undefined;
    });
    return request;
  };
  const loadChord = async () => {
    const run = ++chordRun.current;
    chordAbort.current?.abort();
    const controller = new AbortController();
    chordAbort.current = controller;
    setChordStatus("loading");
    setChordLayout([]);
    setChordOverlays({});
    try {
      const nextDocument = await chordRepository.getChord(
        item.id,
        controller.signal,
      );
      if (controller.signal.aborted || run !== chordRun.current) return;
      let nextLayout: ChordLayoutPage[] = [];
      let nextOverlays: Record<string, PdfChordOverlayMarker[]> = {};
      if ("type" in nextDocument && nextDocument.type === "note-aligned") {
        try {
          // Reuse the exact PDF resource shown by the reader; the shared
          // immutable request also deduplicates the first PDF/chord open.
          const pdfAsset = await loadPdfAsset();
          let layoutPages = nextDocument.pages;
          const layoutResourceKey = `${item.id}:${pdfAsset.sourceVersion}`;
          if (pdfAsset.source === "fork") {
            // Chord JSON pages are song-relative; the fork manifest maps them
            // to absolute pages in the shared KR master PDF.
            const offset = Math.max(0, pdfAsset.initialPage - 1);
            layoutPages = Object.fromEntries(
              Object.entries(nextDocument.pages).map(([page, entries]) => [
                String(Number(page) + offset),
                entries,
              ]),
            );
          }
          // PDF.js and the coordinate mapper are only needed for a visible
          // note-aligned chord layer. Keep them outside the Kidung route's
          // first-load chunk so text-only readers do not pay the PDF cost.
          const { buildChordPresentationFromPdf } =
            await import("./chord-layout-pdf.js");
          const presentation = await buildChordPresentationFromPdf(
            pdfAsset.src,
            layoutPages,
            layoutResourceKey,
          );
          if (controller.signal.aborted || run !== chordRun.current) return;
          nextLayout = presentation.layout;
          nextOverlays = presentation.overlays;
        } catch {
          // Chord JSON remains useful offline even when its optional PDF
          // coordinate source is unavailable; the viewer renders a clear
          // degraded note-index fallback below.
          show(translate(locale, "kidung.chordLayoutRetry"));
        }
      }
      setChordDocument(nextDocument);
      const sourceKey = inferChordDocumentKey(nextDocument);
      if (!keyInitialized.current && sourceKey) {
        const nextSourceKey = chordKeyIndex(sourceKey);
        if (nextSourceKey !== undefined) {
          setSourceKeyIndex(nextSourceKey);
          setKeyIndex(
            (((nextSourceKey + transposeRef.current) % 12) + 12) % 12,
          );
        }
        keyInitialized.current = true;
      }
      setChordLayout(nextLayout);
      setChordOverlays(nextOverlays);
      setChordStatus("ready");
      if (nextLayout.length > 0 || Object.keys(nextOverlays).length > 0)
        show(translate(locale, "kidung.chordPdfVerified"));
      else show(translate(locale, "kidung.chordSourceVerified"));
    } catch {
      if (controller.signal.aborted || run !== chordRun.current) return;
      setChordStatus("error");
      show(
        `${translate(locale, "kidung.chordUnavailable")}; ${translate(locale, "kidung.connectRetry")}`,
      );
    } finally {
      if (chordAbort.current === controller) chordAbort.current = undefined;
    }
  };
  const loadPdf = async () => {
    const run = ++pdfRun.current;
    setViewerMode("pdf");
    writeHymnViewerMode(item.id, "pdf");
    setPdfStatus("loading");
    setPdfVersion(undefined);
    try {
      const asset = await loadPdfAsset();
      if (run !== pdfRun.current) return;
      const nextUrl = asset.src;
      setPdfBytes(asset.bytes);
      setPdfInitialPage(asset.initialPage);
      setPdfPageCount(asset.pageCount);
      setPdfSource(asset.source);
      setPdfVersion(asset.sourceVersion);
      setPdfUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return nextUrl;
      });
      setPdfStatus("ready");
      show(
        asset.source === "fork"
          ? translate(locale, "kidung.pdfForkOpened")
          : translate(locale, "kidung.pdfCanonicalFallback"),
      );
    } catch {
      if (run !== pdfRun.current) return;
      setPdfStatus("error");
      show(
        `${translate(locale, "kidung.pdfFailed")}. ${translate(locale, "kidung.pdfRetry")}`,
      );
    }
  };
  const selectViewerMode = (mode: HymnViewerMode) => {
    writeHymnViewerMode(item.id, mode);
    setViewerMode(mode);
    if (mode === "pdf" && pdfStatus !== "ready") void loadPdf();
  };
  const toggleChords = () => {
    const next = !chordsVisible;
    setChordsVisible(next);
    writeHymnChordVisibility(item.id, next);
    if (next && chordStatus !== "ready" && chordStatus !== "loading")
      void loadChord();
  };
  const loadMidi = async () => {
    if (midiState.songId === item.id) {
      if (midiState.status === "playing") {
        await speechPlayer.stop();
        await midiPlayer.pause();
        setMidiStatus("ready");
        show(translate(locale, "kidung.midiReadyHint"));
        return;
      }
      if (
        midiState.status === "paused" ||
        midiState.status === "ready" ||
        midiState.status === "stopped"
      ) {
        try {
          await speechPlayer.stop();
          await midiPlayer.play();
          setMidiStatus("ready");
          show(translate(locale, "kidung.midiPlaying"));
        } catch {
          setMidiStatus("error");
          show(translate(locale, "kidung.midiUnavailable"));
        }
        return;
      }
    }
    if (!musicLock) {
      setMidiStatus("error");
      show("MIDI lock belum siap; coba lagi sebentar.");
      return;
    }
    const ref = findMusicAsset(musicLock, "midi", item.midiPath);
    if (!ref) {
      setMidiStatus("error");
      show("MIDI belum tersedia pada lock asset.");
      return;
    }
    setMidiStatus("loading");
    try {
      const bytes = await loadMusicAsset(ref);
      const loaded = await midiLoader.load({
        id: item.id,
        url: `https://raw.githubusercontent.com/gyspnk/gyschordweb/${musicLock.sourceCommit}/docs/${ref.path}`,
        sourceHash: ref.sha256,
        bytes,
      });
      const loadedIntoPlayer = await midiPlayer.load(
        item.id,
        item.title,
        loaded.midi,
        {
          rawMidi: bytes,
          sourceHash: ref.sha256,
        },
      );
      if (!loadedIntoPlayer) return;
      const queueIndex = getMidiPlaylist().items.findIndex(
        (entry) => entry.songId === item.id,
      );
      if (queueIndex >= 0) selectMidiPlaylistItem(queueIndex);
      setMidiStatus("ready");
      // Loading the binary/parser is independent from starting Web Audio.
      // Match gyschordweb: the first activation prepares the song and the
      // next activation is the explicit play gesture.
      show(translate(locale, "kidung.midiReadyHint"));
    } catch {
      setMidiStatus("error");
      show(translate(locale, "kidung.midiUnavailable"));
    }
  };
  const renderedKey = chordKeyName(keyIndex, accidental);
  const updateTypography = (patch: Partial<HymnTypography>) => {
    setTypography((current) =>
      writeHymnTypography(item.id, { ...current, ...patch }),
    );
  };
  const updateTranspose = (next: number) => {
    const bounded = Math.max(-6, Math.min(6, next));
    transposeRef.current = bounded;
    setTranspose(bounded);
    setKeyIndex((((sourceKeyIndex + bounded) % 12) + 12) % 12);
    void midiPlayer.setTranspose(bounded).catch(() => undefined);
  };
  return (
    <div
      className={`page hymn-detail-page ${viewerMode === "pdf" ? "is-pdf-viewer" : "is-text-viewer"}`}
    >
      <section className="detail-hero">
        <div className="hymn-text-title">
          <Link
            className="viewer-chrome-button"
            to="/kidung"
            aria-label={translate(locale, "kidung.back")}
          >
            <Icon name="chevronLeft" size={18} />
            <span className="sr-only">{translate(locale, "kidung.back")}</span>
          </Link>
          <h1>{item.title}</h1>
        </div>
        <div className="detail-neighbors">
          <button
            type="button"
            className="quiet-button detail-neighbor-button"
            disabled={!prev}
            onClick={() => prev && navigate(`/kidung/${prev.id}`)}
            aria-label={translate(locale, "kidung.previous")}
            title={translate(locale, "kidung.previous")}
          >
            <Icon name="chevronLeft" size={18} />
            <span className="control-copy">
              {translate(locale, "kidung.previous")}
            </span>
          </button>
          <button
            type="button"
            className="quiet-button detail-neighbor-button"
            disabled={!next}
            onClick={() => next && navigate(`/kidung/${next.id}`)}
            aria-label={translate(locale, "kidung.next")}
            title={translate(locale, "kidung.next")}
          >
            <span className="control-copy">
              {translate(locale, "kidung.next")}
            </span>
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </section>
      <section className="hymn-detail-surface">
        {viewerMode === "pdf" && (
          <div
            className="hymn-pdf-viewer-chrome"
            role="toolbar"
            aria-label="Navigasi viewer Kidung"
          >
            <button
              type="button"
              className="viewer-chrome-button"
              onClick={() => selectViewerMode("lyrics")}
              aria-label="Kembali ke lirik"
            >
              <span aria-hidden="true">
                <Icon name="chevronLeft" size={18} />
              </span>
              <span className="viewer-chrome-copy">Lirik</span>
            </button>
            <button
              type="button"
              className="viewer-chrome-button"
              disabled={!prev}
              onClick={() => prev && navigate(`/kidung/${prev.id}`)}
              aria-label={translate(locale, "kidung.previous")}
            >
              <span aria-hidden="true">
                <Icon name="chevronLeft" size={18} />
              </span>
              <span className="viewer-chrome-copy">
                {translate(locale, "kidung.previous")}
              </span>
            </button>
            <div className="hymn-pdf-viewer-title">
              <strong>{item.title}</strong>
              <small>
                {numberLabel(item.number)} · {item.book}
              </small>
            </div>
            <button
              type="button"
              className="viewer-chrome-button"
              disabled={!next}
              onClick={() => next && navigate(`/kidung/${next.id}`)}
              aria-label={translate(locale, "kidung.next")}
            >
              <span className="viewer-chrome-copy">
                {translate(locale, "kidung.next")}
              </span>
              <span aria-hidden="true">
                <Icon name="chevronRight" size={18} />
              </span>
            </button>
            {midiAvailable && (
              <button
                type="button"
                className="viewer-chrome-button viewer-chrome-midi"
                onClick={() => void loadMidi()}
                disabled={
                  midiStatus === "loading" || midiState.status === "loading"
                }
                aria-label="Buka MIDI dari viewer"
              >
                <span aria-hidden="true">
                  <Icon name="music" size={18} />
                </span>
                <span className="viewer-chrome-copy">MIDI</span>
              </button>
            )}
          </div>
        )}
        <div className="hymn-text-toolbar">
          <div className="detail-actions">
            {!item.assetCode && (
              <button
                type="button"
                className="quiet-button hymn-action"
                onClick={toggleChords}
                disabled={chordStatus === "loading"}
                aria-pressed={chordsVisible}
                aria-label={
                  chordStatus === "loading"
                    ? translate(locale, "kidung.loadingChord")
                    : chordsVisible
                      ? translate(locale, "kidung.hideChord")
                      : translate(locale, "kidung.showChord")
                }
              >
                <span className="hymn-action-icon" aria-hidden="true">
                  <Icon name="music" size={17} />
                </span>
                <span className="hymn-action-label">
                  {chordStatus === "loading"
                    ? translate(locale, "kidung.loadingChord")
                    : chordsVisible
                      ? translate(locale, "kidung.hideChord")
                      : translate(locale, "kidung.showChord")}
                </span>
              </button>
            )}
            {midiAvailable && (
              <button
                type="button"
                className="primary-button hymn-action hymn-action-primary"
                onClick={() => void loadMidi()}
                disabled={
                  midiStatus === "loading" || midiState.status === "loading"
                }
                aria-label={
                  midiState.songId === item.id && midiState.status === "playing"
                    ? translate(locale, "kidung.pauseMidi")
                    : midiStatus === "loading"
                      ? translate(locale, "kidung.loadingMidi")
                      : midiStatus === "ready"
                        ? translate(locale, "kidung.midiReady")
                        : translate(locale, "kidung.playMidi")
                }
              >
                <span className="hymn-action-icon" aria-hidden="true">
                  <Icon
                    name={
                      midiState.songId === item.id &&
                      midiState.status === "playing"
                        ? "pause"
                        : "play"
                    }
                    size={17}
                  />
                </span>
                <span className="hymn-action-label">
                  {midiState.songId === item.id &&
                  midiState.status === "playing"
                    ? translate(locale, "kidung.pauseMidi")
                    : midiStatus === "loading"
                      ? translate(locale, "kidung.loadingMidi")
                      : midiStatus === "ready"
                        ? translate(locale, "kidung.midiReady")
                        : translate(locale, "kidung.playMidi")}
                </span>
              </button>
            )}
            <button
              type="button"
              className="quiet-button hymn-action"
              onClick={() =>
                viewerMode === "pdf"
                  ? selectViewerMode("lyrics")
                  : selectViewerMode("pdf")
              }
              disabled={pdfStatus === "loading"}
              aria-label={
                pdfStatus === "loading"
                  ? translate(locale, "kidung.loadingPdf")
                  : viewerMode === "pdf"
                    ? translate(locale, "kidung.closePdf")
                    : translate(locale, "kidung.openPdf")
              }
            >
              <span className="hymn-action-icon" aria-hidden="true">
                <Icon name="file" size={17} />
              </span>
              <span className="hymn-action-label">
                {pdfStatus === "loading"
                  ? translate(locale, "kidung.loadingPdf")
                  : viewerMode === "pdf"
                    ? translate(locale, "kidung.closePdf")
                    : translate(locale, "kidung.openPdf")}
              </span>
            </button>
          </div>
          <details className="hymn-more-actions" name="hymn-text-toolbar-menu">
            <summary
              className="hymn-more-actions-summary"
              aria-label="Opsi kidung"
              title="Opsi kidung"
            >
              <Icon name="more" size={18} />
              <span className="sr-only">Opsi kidung</span>
            </summary>
            <div className="hymn-more-actions-panel">
              <button
                type="button"
                className="quiet-button hymn-action"
                onClick={toggle}
                aria-pressed={favorite}
              >
                <span className="hymn-action-icon" aria-hidden="true">
                  <Icon name="heart" size={17} />
                </span>
                <span className="hymn-action-label">
                  {favorite
                    ? translate(locale, "kidung.favorite")
                    : translate(locale, "kidung.saveFavorite")}
                </span>
              </button>
              {!item.assetCode && (
                <button
                  type="button"
                  className="quiet-button hymn-action"
                  aria-pressed={playlist.items.some(
                    (entry) => entry.songId === item.id,
                  )}
                  onClick={() => {
                    const added = addMidiPlaylistItem({
                      songId: item.id,
                      title: item.title,
                      ...(musicMidiRef?.sha256
                        ? {
                            sourceHash: musicMidiRef.sha256,
                          }
                        : {}),
                    });
                    show(
                      added
                        ? translate(locale, "kidung.queueAdded")
                        : translate(locale, "kidung.queueExists"),
                    );
                  }}
                >
                  <span className="hymn-action-icon" aria-hidden="true">
                    <Icon name="playlist" size={17} />
                  </span>
                  <span className="hymn-action-label">
                    {playlist.items.some((entry) => entry.songId === item.id)
                      ? translate(locale, "kidung.queueCount", {
                          count: playlist.items.length,
                        })
                      : translate(locale, "kidung.queueAdd")}
                  </span>
                </button>
              )}
              {pdfBytes && (
                <button
                  type="button"
                  className="quiet-button hymn-action"
                  onClick={() => {
                    const ref = musicPdfRef;
                    if (pdfSource === "canonical" && ref)
                      downloadMusicAsset(ref, pdfBytes);
                    if (pdfSource === "fork")
                      downloadMusicAsset(
                        {
                          id: `KR-${numberLabel(item.number)}`,
                          path: "kr_master.pdf",
                        },
                        pdfBytes,
                      );
                    if (pdfSource === "distributed")
                      downloadMusicAsset(
                        { id: item.id, path: item.pdfPath },
                        pdfBytes,
                      );
                  }}
                >
                  <span className="hymn-action-icon" aria-hidden="true">
                    <Icon name="download" size={17} />
                  </span>
                  <span className="hymn-action-label">
                    {translate(locale, "kidung.downloadPdf")}
                  </span>
                </button>
              )}
            </div>
          </details>
          <details
            className="hymn-reader-settings"
            name="hymn-text-toolbar-menu"
          >
            <summary
              className="hymn-reader-settings-summary"
              aria-label="Pengaturan baca"
              title="Pengaturan baca"
            >
              <Icon name="settings" size={18} />
              <span className="sr-only">Pengaturan baca</span>
            </summary>
            <div className="song-controls">
              {midiAvailable && (
                <div className="hymn-midi-reader-controls">
                  <output className="hymn-soundfont-active">
                    <span>{translate(locale, "kidung.activeSoundfont")}</span>
                    <strong>GeneralUser-GS</strong>
                  </output>
                  <label className="hymn-instrument-select">
                    <span>{translate(locale, "kidung.instrument")}</span>
                    <select
                      aria-label={translate(locale, "kidung.instrument")}
                      value={midiSettings.instrument}
                      onChange={(event) =>
                        void midiPlayer
                          .setInstrument(Number(event.target.value))
                          .catch(() => undefined)
                      }
                    >
                      <option value={-1}>{midiInstrumentLabel(-1)}</option>
                      {GM_INSTRUMENTS.map((name, program) => (
                        <option key={program} value={program}>
                          {String(program + 1).padStart(3, "0")} · {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="hymn-tempo-control">
                    <span>{translate(locale, "kidung.tempo")}</span>
                    <button
                      type="button"
                      onClick={() =>
                        void midiPlayer.setTempo(midiSettings.tempo - 2)
                      }
                      aria-label={translate(locale, "kidung.tempoDown")}
                    >
                      −
                    </button>
                    <output>{midiSettings.tempo} BPM</output>
                    <button
                      type="button"
                      onClick={() =>
                        void midiPlayer.setTempo(midiSettings.tempo + 2)
                      }
                      aria-label={translate(locale, "kidung.tempoUp")}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}
              <Select
                value={keyIndex}
                onChange={(value) => {
                  setKeyIndex(value);
                  updateTranspose(transposeBetweenKeys(sourceKeyIndex, value));
                }}
                label={translate(locale, "kidung.key")}
                options={Array.from({ length: 12 }, (_, value) => ({
                  value,
                  label: chordKeyName(value, accidental),
                }))}
              />
              <Select
                value={accidental}
                onChange={setAccidental}
                label={translate(locale, "kidung.notation")}
                options={[
                  { value: "sharp", label: translate(locale, "kidung.sharp") },
                  { value: "flat", label: translate(locale, "kidung.flat") },
                ]}
              />
              <div className="transpose-control">
                <span>Nada tampil · {renderedKey}</span>
                <div>
                  <button
                    type="button"
                    onClick={() => updateTranspose(transpose - 1)}
                    aria-label={translate(locale, "kidung.transposeDown")}
                  >
                    −
                  </button>
                  <strong>{transpose > 0 ? `+${transpose}` : transpose}</strong>
                  <button
                    type="button"
                    onClick={() => updateTranspose(transpose + 1)}
                    aria-label={translate(locale, "kidung.transposeUp")}
                  >
                    +
                  </button>
                </div>
              </div>
              <div
                className="reader-preferences"
                aria-label={translate(locale, "kidung.textSettings")}
              >
                <span>{translate(locale, "kidung.text")}</span>
                <button
                  type="button"
                  onClick={() =>
                    updateTypography({ fontSize: typography.fontSize - 1 })
                  }
                  aria-label={translate(locale, "kidung.decreaseText")}
                >
                  A−
                </button>
                <output aria-live="polite">
                  {Math.round(typography.fontSize)} px
                </output>
                <button
                  type="button"
                  onClick={() =>
                    updateTypography({ fontSize: typography.fontSize + 1 })
                  }
                  aria-label={translate(locale, "kidung.increaseText")}
                >
                  A+
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateTypography({
                      lineHeight: typography.lineHeight - 0.1,
                    })
                  }
                  aria-label={translate(locale, "kidung.decreaseSpacing")}
                >
                  − Spasi
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateTypography({
                      lineHeight: typography.lineHeight + 0.1,
                    })
                  }
                  aria-label={translate(locale, "kidung.increaseSpacing")}
                >
                  + Spasi
                </button>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => updateTypography(DEFAULT_HYMN_TYPOGRAPHY)}
                >
                  {translate(locale, "kidung.resetText")}
                </button>
              </div>
            </div>
          </details>
        </div>
        {viewerMode === "lyrics" && (
          <article
            className={`lyrics-sheet verse-enter is-${transitionDirection}${gestureActive ? " is-pinching" : ""}`}
            key={`${item.id}-${safeVerseIndex}`}
            ref={lyricsRef}
            aria-label={`${item.title}, bait ${safeVerseIndex + 1}`}
            style={{
              fontSize: `${fitFontSize}px`,
              lineHeight: typography.lineHeight,
            }}
            data-autofit-font-size={fitFontSize}
            onPointerDown={onLyricsPointerDown}
            onPointerMove={onLyricsPointerMove}
            onPointerUp={finishLyricsPointer}
            onPointerCancel={finishLyricsPointer}
          >
            {lyricLines.map((line, index) => {
              const chordLine = chordsVisible ? chordLines[index] : undefined;
              return (
                <p key={`${index}-${line}`}>
                  {chordLine && chordLine.chords.length > 0 ? (
                    <ChordCapability
                      lines={[chordLine]}
                      transpose={transpose}
                      accidental={accidental}
                    />
                  ) : (
                    line || " "
                  )}
                </p>
              );
            })}
          </article>
        )}
        {chordsVisible && chordStatus === "loading" && (
          <div className="loading-panel" role="status">
            {translate(locale, "kidung.chordVerifying")}
          </div>
        )}
        {chordsVisible && chordStatus === "error" && (
          <div className="error-panel" role="alert">
            <strong>{translate(locale, "kidung.chordUnavailable")}</strong>
            <span>{translate(locale, "kidung.connectRetry")}</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void loadChord()}
            >
              Coba lagi
            </button>
          </div>
        )}
        {viewerMode === "pdf" && pdfStatus === "loading" && (
          <div className="loading-panel" role="status">
            {translate(locale, "kidung.pdfOpening")}
          </div>
        )}
        {viewerMode === "pdf" && pdfStatus === "error" && (
          <div className="error-panel" role="alert">
            <strong>{translate(locale, "kidung.pdfFailed")}</strong>
            <span>{translate(locale, "kidung.pdfRetry")}</span>
            <button
              className="secondary-button"
              type="button"
              onClick={() => void loadPdf()}
            >
              Coba lagi
            </button>
          </div>
        )}
        {viewerMode === "pdf" && pdfStatus === "ready" && (
          <Suspense
            fallback={
              <div className="loading-panel">
                {translate(locale, "kidung.pdfOpening")}
              </div>
            }
          >
            <PdfReader
              src={pdfUrl ?? ""}
              {...(pdfBytes ? { data: pdfBytes } : {})}
              initialPage={pdfInitialPage}
              {...(pdfSource === "fork" && pdfPageCount
                ? {
                    pageRange: {
                      start: pdfInitialPage,
                      count: pdfPageCount,
                    },
                  }
                : {})}
              progressKey={`hymn:${item.id}:${pdfVersion ?? pdfSource}`}
              {...(pdfUrl ? { downloadUrl: pdfUrl } : {})}
              title={item.title}
              variant="hymn"
              chordOverlays={pdfChordOverlays}
              chordsVisible={chordsVisible}
            />
          </Suspense>
        )}
        {viewerMode === "lyrics" && (
          <nav
            className="hymn-text-footer"
            aria-label={translate(locale, "kidung.verseNavigation")}
          >
            <button
              type="button"
              disabled={!prev}
              onClick={() => prev && navigate(`/kidung/${prev.id}`)}
              aria-label={translate(locale, "kidung.previous")}
            >
              <Icon name="skipPrevious" size={19} />
            </button>
            <button
              type="button"
              disabled={safeVerseIndex === 0}
              onClick={() => changeVerse(-1)}
              aria-label={translate(locale, "kidung.previousVerse")}
            >
              <Icon name="chevronLeft" size={19} />
            </button>
            <span>
              {translate(locale, "kidung.verseCount", {
                current: safeVerseIndex + 1,
                total: verses.length,
              })}
            </span>
            <button
              type="button"
              disabled={safeVerseIndex >= verses.length - 1}
              onClick={() => changeVerse(1)}
              aria-label={translate(locale, "kidung.nextVerse")}
            >
              <Icon name="chevronRight" size={19} />
            </button>
            <button
              type="button"
              disabled={!next}
              onClick={() => next && navigate(`/kidung/${next.id}`)}
              aria-label={translate(locale, "kidung.next")}
            >
              <Icon name="skipNext" size={19} />
            </button>
          </nav>
        )}
      </section>
      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </div>
  );
}
