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
  type MouseEvent as ReactMouseEvent,
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
import { getHymnPdfMeta, warmHymnPdfMeta } from "./hymn-pdf-meta.js";
import {
  readHymnViewerPrefs,
  setDefaultPdfLayout,
  writeHymnViewerPrefs,
  type HymnViewerPrefs,
} from "./hymn-viewer-prefs.js";
import { observeSingleLineFit } from "./text-fit.js";
import { triggerRipple } from "./ripple.js";
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
import {
  addSongToActivePlaylist,
  createSavedPlaylist,
  deleteSavedPlaylist,
  getActivePlaylistId,
  getSavedPlaylists,
  removeSongFromPlaylist,
  renameSavedPlaylist,
  setActivePlaylist,
  subscribeSavedPlaylists,
  type SavedPlaylist,
} from "./kidung-playlists.js";
import { applyAutoNextMode, getAutoNextMode } from "./midi-playlist.js";
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
  readNaturalChordPreference,
  writeHymnTypography,
  writeNaturalChordPreference,
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
function formatMidiTime(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
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
    return <HymnPlaylistPage locale={locale} catalog={catalog} />;
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

function HymnPlaylistPage({
  locale,
  catalog,
}: {
  locale: Locale;
  catalog: CatalogState;
}) {
  const navigate = useNavigate();
  const playlist = useSyncExternalStore(
    subscribeMidiPlaylist,
    getMidiPlaylist,
    getMidiPlaylist,
  );
  const savedPlaylists = useSyncExternalStore(
    subscribeSavedPlaylists,
    getSavedPlaylists,
    getSavedPlaylists,
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

  const saveQueueAsPlaylist = () => {
    const name = window.prompt(
      "Nama playlist:",
      `Playlist ${savedPlaylists.length + 1}`,
    );
    if (!name?.trim()) return;
    const saved = createSavedPlaylist(name);
    setActivePlaylist(saved.id);
    for (const item of playlist.items) addSongToActivePlaylist(item.songId);
    showToastLike(name);
    // Refresh snapshot after the bulk add
    window.dispatchEvent(new CustomEvent("gys-kidung-playlists-change"));
  };
  const showToastLike = (name: string) => {
    window.setTimeout(() => setNoticeLocal(`Playlist "${name}" tersimpan`), 0);
  };
  const [noticeLocal, setNoticeLocal] = useState("");
  const loadSavedPlaylist = (saved: SavedPlaylist) => {
    if (catalog.status !== "ready") return;
    clearMidiPlaylist();
    let added = 0;
    for (const songId of saved.songIds) {
      const entry = catalog.items.find((candidate) => candidate.id === songId);
      if (!entry) continue;
      if (addMidiPlaylistItem({ songId, title: entry.title })) added += 1;
    }
    setNoticeLocal(`Dimuat: ${saved.name} (${added} lagu)`);
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
          <Select
            value={getAutoNextMode()}
            onChange={(mode) => applyAutoNextMode(mode)}
            label="Putar berikutnya"
            options={[
              { value: "off", label: "Tidak ada (stop di akhir)" },
              { value: "number", label: "Sesuai Nomor (urutan)" },
              { value: "playlist", label: "Sesuai Playlist" },
              { value: "one", label: "Ulangi lagu ini" },
              { value: "all", label: "Ulangi semua" },
              { value: "shuffle-all", label: "Acak semua lagu" },
              { value: "shuffle-playlist", label: "Acak dalam playlist" },
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
          <button
            className="text-button"
            type="button"
            onClick={saveQueueAsPlaylist}
            disabled={playlist.items.length === 0}
          >
            Simpan sebagai playlist
          </button>
        </div>
        {noticeLocal && (
          <p className="kidung-inline-error" role="status">
            {noticeLocal}
          </p>
        )}
        {savedPlaylists.length > 0 && (
          <section
            className="kidung-saved-playlists"
            aria-label="Playlist tersimpan"
          >
            <h2>Playlist tersimpan</h2>
            {savedPlaylists.map((saved) => {
              return (
                <div className="kidung-saved-playlist-row" key={saved.id}>
                  <button
                    type="button"
                    className="kidung-playlist-song"
                    onClick={() => {
                      setActivePlaylist(saved.id);
                      loadSavedPlaylist(saved);
                    }}
                  >
                    <span>
                      <strong>{saved.name}</strong>
                      <small>
                        {saved.songIds.length} lagu
                        {getActivePlaylistId() === saved.id ? " Â· Aktif" : ""}
                      </small>
                    </span>
                  </button>
                  <div className="kidung-playlist-actions">
                    {saved.songIds.map((songId) => (
                      <button
                        key={`remove-${songId}`}
                        type="button"
                        className="text-button"
                        onClick={() => removeSongFromPlaylist(saved.id, songId)}
                      >
                        âˆ’ {songId}
                      </button>
                    ))}
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        const name = window.prompt("Ubah nama:", saved.name);
                        if (name?.trim()) renameSavedPlaylist(saved.id, name);
                      }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => deleteSavedPlaylist(saved.id)}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              );
            })}
          </section>
        )}
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
              Kembali ke daftar Kidung â†’
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
  const [naturalChords, setNaturalChords] = useState(() =>
    readNaturalChordPreference(),
  );
  const [viewPrefs, setViewPrefs] = useState<HymnViewerPrefs>(() =>
    readHymnViewerPrefs(),
  );
  const [defaultPdfLayout, setDefaultPdfLayoutState] = useState<
    "single" | "double" | "vertical"
  >(() => {
    const prefs = readHymnViewerPrefs();
    return prefs.defaultTwoPage
      ? "double"
      : prefs.defaultVerticalScroll
        ? "vertical"
        : "single";
  });
  const applyViewPrefs = (next: HymnViewerPrefs) => {
    setViewPrefs(next);
    writeHymnViewerPrefs(next);
  };
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
                { value: "zh", label: "ä¸­æ–‡" },
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
          <div className="kidung-settings-controls">
            <Select
              value={playlist.crossfadeMs}
              onChange={(value) =>
                updateMidiPlaylistOptions({ crossfadeMs: value })
              }
              label="Fade lintas saat ganti lagu"
              options={[
                { value: 0, label: "Mati (potong langsung)" },
                { value: 2000, label: "2 detik (lembut)" },
                { value: 3000, label: "3 detik (gapless)" },
                { value: 5000, label: "5 detik (dramatis)" },
              ]}
            />
          </div>
          <label className="kidung-settings-switch">
            <input
              type="checkbox"
              checked={naturalChords}
              onChange={(event) => {
                const next = event.target.checked;
                setNaturalChords(next);
                writeNaturalChordPreference(next);
              }}
            />
            <span>
              <strong>Nada dasar alami (chord natural)</strong>
              <small>
                Lagu ber-kunci mol otomatis naik 1 nada agar chord tetap
                natural.
              </small>
            </span>
          </label>
          <label className="kidung-settings-switch">
            <input
              type="checkbox"
              checked={viewPrefs.preloadEnabled}
              onChange={(event) =>
                applyViewPrefs({
                  ...viewPrefs,
                  preloadEnabled: event.target.checked,
                })
              }
            />
            <span>
              <strong>Preload lagu berikutnya</strong>
              <small>
                MIDI + PDF lagu tetangga di-render di latar agar pindah lagu
                instan.
              </small>
            </span>
          </label>
          <div className="kidung-settings-controls">
            <Select
              value={viewPrefs.preloadCount}
              onChange={(value) =>
                applyViewPrefs({ ...viewPrefs, preloadCount: value })
              }
              label="Jumlah preload"
              options={[
                { value: 1, label: "1 lagu sebelum & sesudah" },
                { value: 2, label: "2 lagu sebelum & sesudah" },
                { value: 3, label: "3 lagu sebelum & sesudah" },
              ]}
            />
            <Select
              value={defaultPdfLayout}
              onChange={(value) => {
                setDefaultPdfLayout(value);
                setDefaultPdfLayoutState(value);
              }}
              label="Tampilan PDF default"
              options={[
                { value: "single", label: "1 halaman" },
                { value: "double", label: "2 halaman" },
                { value: "vertical", label: "Gulir vertikal" },
              ]}
            />
          </div>
          <div className="kidung-settings-summary">
            <span>Playlist tersimpan</span>
            <strong>{playlist.items.length} lagu</strong>
          </div>
          <Link className="text-button" to="/kidung?section=playlist">
            Kelola playlist â†’
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
  // gyschordweb GysLastPlayedSongIndex: restore the last opened hymn once per
  // session so a fresh app launch lands directly on the previous song.
  useEffect(() => {
    if (state.status !== "ready" || typeof sessionStorage === "undefined")
      return;
    if (sessionStorage.getItem("gys-hymn-autoopen-done")) return;
    const last = getActivity().hymn;
    if (last && allItems.some((candidate) => candidate.id === last.id)) {
      sessionStorage.setItem("gys-hymn-autoopen-done", "1");
      navigate(`/kidung/${last.id}`);
    } else {
      sessionStorage.setItem("gys-hymn-autoopen-done", "1");
    }
  }, [state, allItems, navigate]);
  const listRef = useRef<HTMLOListElement>(null);
  const queueIds = useMemo(
    () => new Set(getMidiPlaylist().items.map((entry) => entry.songId)),
    [filtered],
  );
  const [queueTick, setQueueTick] = useState(0);
  useEffect(
    () => subscribeMidiPlaylist(() => setQueueTick((tick) => tick + 1)),
    [],
  );
  void queueTick;
  // gyschordweb fitListTitles: single-line auto-fit per row + web font refit.
  useEffect(() => {
    if (state.status !== "ready") return;
    return observeSingleLineFit(listRef.current, ".pujian-title", {
      maxPx: 16,
      minPx: 10,
    });
  }, [state, filtered]);
  const onRowClick = (
    event: ReactMouseEvent<HTMLButtonElement>,
    songId: string,
  ) => {
    triggerRipple(
      event.currentTarget.closest("li") ?? event.currentTarget,
      event.clientX,
      event.clientY,
    );
    navigate(`/kidung/${songId}`);
  };
  const onRowQueue = (
    event: ReactMouseEvent<HTMLButtonElement>,
    item: HymnCatalogEntry,
  ) => {
    event.stopPropagation();
    triggerRipple(event.currentTarget, event.clientX, event.clientY);
    addMidiPlaylistItem({
      songId: item.id,
      title: item.title,
    });
  };
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
          <ol className="pujian-list" ref={listRef}>
            {filtered.map((item) => {
              const inQueue = queueIds.has(item.id);
              return (
                <li
                  key={item.id}
                  className="pujian-item"
                  data-id={item.id}
                  data-nomor={String(item.number).toLowerCase()}
                  data-judul={item.title.toLowerCase()}
                >
                  <span className="pujian-nomor" aria-hidden="true">
                    {numberLabel(item.number)}
                  </span>
                  <button
                    type="button"
                    className="pujian-title"
                    onClick={(event) => onRowClick(event, item.id)}
                  >
                    {item.title}
                  </button>
                  {!item.assetCode && (
                    <button
                      type="button"
                      className={`icon-button add-to-playlist-btn${inQueue ? " in-playlist" : ""}`}
                      data-id={item.id}
                      aria-pressed={inQueue}
                      onClick={(event) => onRowQueue(event, item)}
                      title={
                        inQueue ? "Sudah di antrean" : "Tambah ke Playlist"
                      }
                      aria-label={
                        inQueue
                          ? `${item.title} sudah di antrean`
                          : `Tambah ${item.title} ke Playlist`
                      }
                    >
                      <span aria-hidden="true">{inQueue ? "âœ“" : "ï¼‹"}</span>
                    </button>
                  )}
                </li>
              );
            })}
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
  const [capo, setCapo] = useState(0);
  const [viewScope, setViewScope] = useState<"all" | "verse">(() => {
    if (typeof window === "undefined") return "verse";
    return (
      (localStorage.getItem("gys-hymn-view-scope") as "all" | "verse") ??
      "verse"
    );
  });
  const updateViewScope = (scope: "all" | "verse") => {
    setViewScope(scope);
    if (typeof window !== "undefined") {
      localStorage.setItem("gys-hymn-view-scope", scope);
    }
  };
  const [autoScrollActive, setAutoScrollActive] = useState(false);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(2);
  const autoScrollTimer = useRef<number | undefined>(undefined);
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
  // gyschordweb chord editor (note-aligned): 5 taps on title toggles it,
  // edited chords are local until the user saves the .chord.json.
  const [chordEditorEnabled, setChordEditorEnabled] = useState(false);
  const [editableChords, setEditableChords] = useState<
    Record<string, PdfChordOverlayMarker[]>
  >({});
  const titleTapTimer = useRef<number | undefined>(undefined);
  const titleTapCount = useRef(0);
  const chordFileInput = useRef<HTMLInputElement>(null);
  const handleTitleTap = () => {
    titleTapCount.current += 1;
    if (titleTapTimer.current !== undefined)
      window.clearTimeout(titleTapTimer.current);
    titleTapTimer.current = window.setTimeout(() => {
      titleTapCount.current = 0;
    }, 1800);
    const required = chordEditorEnabled ? 3 : 5;
    if (titleTapCount.current < required) return;
    titleTapCount.current = 0;
    const nextEnabled = !chordEditorEnabled;
    setChordEditorEnabled(nextEnabled);
    // Seed the editable clone from the transposed overlay when opening.
    if (nextEnabled) {
      setEditableChords(
        Object.fromEntries(
          Object.entries(pdfChordOverlays).map(([page, markers]) => [
            page,
            markers.map((marker) => ({ ...marker })),
          ]),
        ),
      );
    }
    show(nextEnabled ? "Mode edit chord aktif" : "Mode edit chord nonaktif");
  };
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
  const lastFitRef = useRef<number>(0);
  const holdState = useRef<{
    timeout: number | undefined;
    interval: number | undefined;
  }>({ timeout: undefined, interval: undefined });
  const holdStart = (fn: () => void) => {
    fn();
    holdState.current.timeout = window.setTimeout(() => {
      holdState.current.interval = window.setInterval(fn, 90);
    }, 400);
  };
  const holdStop = () => {
    if (holdState.current.timeout !== undefined)
      window.clearTimeout(holdState.current.timeout);
    if (holdState.current.interval !== undefined)
      window.clearInterval(holdState.current.interval);
    holdState.current.timeout = undefined;
    holdState.current.interval = undefined;
  };
  const [transitionDirection, setTransitionDirection] = useState<
    "previous" | "next"
  >("next");
  const autoLoadedSong = useRef<string | undefined>(undefined);
  const userSetTransposeRef = useRef(false);
  const autoplayRequestRef = useRef(false);
  const keyInitialized = useRef(false);
  const chordRun = useRef(0);
  const chordAbort = useRef<AbortController | undefined>(undefined);
  const pdfRun = useRef(0);
  const pdfAssetPromise = useRef<Promise<HymnPdfAsset> | undefined>(undefined);
  const preloadRun = useRef(0);
  const midiLoadGeneration = useRef(0);
  const isMidiSwitchingRef = useRef(false);
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
  // gyschordweb wrap-around navigation (number mode: last â†’ first).
  const prev =
    sequence.length === 0
      ? undefined
      : index > 0
        ? sequence[index - 1]
        : sequence[sequence.length - 1];
  const next =
    sequence.length === 0
      ? undefined
      : index >= 0 && index < sequence.length - 1
        ? sequence[index + 1]
        : sequence[0];
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
  // gyschordweb `_resolveSongTempoForLoad`: warm per-song PDF tempo/key cache
  useEffect(() => {
    if (item && !item.assetCode)
      void warmHymnPdfMeta(item).catch(() => undefined);
  }, [item]);
  // gyschordweb _forceAutoPlayNext: after a song switch that happened while
  // MIDI was playing, start the new song automatically once it is prepared.
  useEffect(() => {
    if (
      !autoplayRequestRef.current ||
      !item ||
      midiStatus !== "ready" ||
      midiPlayer.snapshot().songId !== item.id ||
      midiPlayer.isPlaying()
    )
      return;
    autoplayRequestRef.current = false;
    void speechPlayer
      .stop()
      .then(() => midiPlayer.play())
      .then(() => undefined)
      .catch(() => undefined);
  }, [item, midiStatus]);
  useEffect(() => {
    setTypography(readHymnTypography(songId));
    setFitFontSize(readHymnTypography(songId).fontSize);
    // gyschordweb originalPdfKey: a detected PDF key is the display base;
    // natural-chord preference seeds a default -1 transpose for black keys.
    const meta = getHymnPdfMeta(songId);
    const natural = readNaturalChordPreference();
    let baseTranspose = midiPlayer.settingsSnapshot().transpose;
    if (
      natural &&
      meta?.preloadTranspose !== undefined &&
      !userSetTransposeRef.current
    )
      baseTranspose = meta.preloadTranspose;
    setTranspose(baseTranspose);
    transposeRef.current = baseTranspose;
    if (meta?.keySemitone !== undefined && meta.keySemitone != null) {
      setSourceKeyIndex(meta.keySemitone);
      setKeyIndex((((meta.keySemitone + baseTranspose) % 12) + 12) % 12);
      keyInitialized.current = true; // PDF key wins over chord-doc inference
    } else {
      setSourceKeyIndex(0);
      setKeyIndex(((baseTranspose % 12) + 12) % 12);
      keyInitialized.current = false;
    }
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
  // gyschordweb body.viewer-active: fullscreen overlay + scroll lock.
  useEffect(() => {
    document.body.classList.toggle("gys-viewer-active", viewerMode === "pdf");
    return () => document.body.classList.remove("gys-viewer-active");
  }, [viewerMode]);
  // gyschordweb fitViewerTitle: single-line autofit for the overlay title.
  const overlayTitleRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewerMode !== "pdf") return;
    return observeSingleLineFit(
      overlayTitleRef.current,
      ".hymn-pdf-viewer-title strong",
      { maxPx: 16, minPx: 9 },
    );
  }, [viewerMode, item?.title]);
  // gyschordweb handleGlobalKeydown (viewer-active): song nav + transpose.
  useEffect(() => {
    if (viewerMode !== "pdf") return;
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT")
      )
        return;
      if (event.ctrlKey || event.metaKey) return;
      if (event.key === "[") {
        event.preventDefault();
        updateTranspose(transpose - 1);
      } else if (event.key === "]") {
        event.preventDefault();
        updateTranspose(transpose + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goToNeighbor(prev);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        goToNeighbor(next);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [viewerMode, prev, next, transpose]);
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
    // gyschordweb prefs.preloadEnabled/preloadCount: mode-aware neighbours.
    const viewPrefs = readHymnViewerPrefs();
    if (!viewPrefs.preloadEnabled) return;
    const count = viewPrefs.preloadCount;
    const candidates: HymnCatalogEntry[] = [];
    if (sequence.length > 0 && index >= 0) {
      for (let offset = 1; offset <= count; offset++) {
        const before =
          sequence[(index - offset + sequence.length) % sequence.length];
        const after = sequence[(index + offset) % sequence.length];
        if (before) candidates.push(before);
        if (after) candidates.push(after);
      }
    }
    const uniqueNeighbors = [
      ...new Map(
        candidates.map((candidate) => [candidate.id, candidate]),
      ).values(),
    ];
    const prefetchedPdf = new Set<string>();
    for (const candidate of uniqueNeighbors) {
      void chordRepository.getChord(candidate.id).catch(() => undefined);
      // gyschordweb _prefetchPdf: low-priority PDF warm-up for neighbours.
      const pdfRef = findMusicAsset(musicLock, "pdf", candidate.pdfPath);
      if (pdfRef && !prefetchedPdf.has(pdfRef.sha256)) {
        prefetchedPdf.add(pdfRef.sha256);
        void resolveMusicAssetUrl(pdfRef, musicLock)
          .then((pdfUrl) =>
            fetch(pdfUrl, { priority: "low", cache: "force-cache" }).then(
              () => undefined,
              () => undefined,
            ),
          )
          .catch(() => undefined);
      }
      const ref = findMusicAsset(musicLock, "midi", candidate.midiPath);
      if (!ref) continue;
      // Both directions get the complete warm path: binary -> parser -> PCM.
      // MidiLoader and loadMusicAsset both deduplicate by immutable hash, so
      // this never creates a second network request when the user taps play.
      void (async () => {
        try {
          // gyschordweb parity: skip if already pre-rendered with same profile
          const already = await midiPlayer
            .hasPreloaded(
              ref.sha256,
              midiSettings.transpose,
              midiSettings.instrument,
              midiSettings.tempo,
            )
            .catch(() => false);
          if (already) return;
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
  const allVersesChordLines = useMemo(() => {
    if (!chordDocument || !chordsVisible) return [];
    return verses.map((verseText, vIdx) => {
      const lines = verseText.split("\n");
      return matchChordLinesToLyrics(lines, chordDocument, chordLayout, vIdx);
    });
  }, [chordDocument, chordLayout, chordsVisible, verses]);

  useEffect(() => {
    if (!autoScrollActive) {
      if (autoScrollTimer.current)
        cancelAnimationFrame(autoScrollTimer.current);
      return;
    }
    let last = performance.now();
    const step = (now: number) => {
      const dt = Math.min(100, now - last) / 1000;
      last = now;
      const px = autoScrollSpeed * 20 * dt;
      window.scrollBy({ top: px, behavior: "auto" });
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 10
      ) {
        setAutoScrollActive(false);
        return;
      }
      autoScrollTimer.current = requestAnimationFrame(step);
    };
    autoScrollTimer.current = requestAnimationFrame(step);
    return () => {
      if (autoScrollTimer.current)
        cancelAnimationFrame(autoScrollTimer.current);
    };
  }, [autoScrollActive, autoScrollSpeed]);

  useLayoutEffect(() => {
    if (viewerMode !== "lyrics") return;
    const element = lyricsRef.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      // gyschordweb v9: hysteresis anti-oscillation - keep smaller size when chord wraps
      element.style.fontSize = `${typography.fontSize}px`;
      const next = autoFitFontSize({
        preferredFontSize: typography.fontSize,
        availableWidth: element.clientWidth,
        measuredWidth: element.scrollWidth,
        lastFittedFontSize: lastFitRef.current,
      });
      lastFitRef.current = next;
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
            chord: transposeChord(marker.chord, transpose - capo, accidental),
          })),
        ]),
      ),
    [accidental, chordOverlays, transpose, capo],
  );
  const editChordAt = (pageKey: string, noteIdx: number, current: string) => {
    const input = window.prompt(
      "Masukkan chord (contoh: C, Câ™¯, Bâ™­, Fdim, Aadd9).\nKosongkan untuk hapus chord di posisi ini.",
      current,
    );
    if (input === null) return;
    const nextChord = input.trim();
    setEditableChords((prev) => {
      const page = prev[pageKey] ?? [];
      const next = nextChord
        ? page.map((marker) =>
            marker.noteIdx === noteIdx
              ? { ...marker, chord: nextChord }
              : marker,
          )
        : page.filter((marker) => marker.noteIdx !== noteIdx);
      return { ...prev, [pageKey]: next };
    });
  };
  const downloadEditorChords = () => {
    // gyschordweb saveNoteChordConfigurationFile: reverse-transpose on save so
    // the file stays relative to the original source data.
    const reverse = -(transpose - capo);
    const pages: Record<string, Array<{ noteIdx: number; chord: string }>> = {};
    for (const [page, markers] of Object.entries(editableChords)) {
      pages[page] = markers
        .filter((marker) => marker.chord.trim().length > 0)
        .map((marker) => ({
          noteIdx: marker.noteIdx,
          chord: transposeChord(marker.chord, reverse, accidental),
        }));
    }
    const documentPayload = {
      version: 2,
      type: "note-aligned",
      pages,
    };
    const blob = new Blob([JSON.stringify(documentPayload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download =
      `${numberLabel(item?.number ?? 0)}_${(item?.title ?? "kidung").replace(/[^\w -]/g, "")}.chord.json`.replace(
        /\s+/g,
        "_",
      );
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
    show("Chord tersimpan sebagai file .chord.json");
  };
  const importEditorChords = (file: File | undefined) => {
    if (!file) return;
    void file.text().then((text) => {
      try {
        const parsed: unknown = JSON.parse(text);
        const candidate = parsed as {
          version?: unknown;
          type?: unknown;
          pages?: unknown;
        };
        if (
          candidate.version !== 2 ||
          candidate.type !== "note-aligned" ||
          !candidate.pages ||
          typeof candidate.pages !== "object"
        ) {
          show("Format file tidak dikenali (harus note-aligned v2).");
          return;
        }
        // Re-attach to known note positions from the verified overlay.
        const normalized: Record<string, PdfChordOverlayMarker[]> = {};
        for (const [page, entries] of Object.entries(
          candidate.pages as Record<
            string,
            Array<{ noteIdx?: unknown; chord?: unknown }>
          >,
        )) {
          if (!Array.isArray(entries)) continue;
          const known = pdfChordOverlays[page] ?? [];
          const markers = entries
            .map((entry) => {
              const noteIdx = Number(entry.noteIdx);
              if (!Number.isInteger(noteIdx) || typeof entry.chord !== "string")
                return undefined;
              const anchorNote = known.find((m) => m.noteIdx === noteIdx);
              if (!anchorNote) return undefined; // no geometry for this note index
              return {
                noteIdx,
                chord: transposeChord(
                  entry.chord,
                  transpose - capo,
                  accidental,
                ),
                xPct: anchorNote.xPct,
                yPct: anchorNote.yPct,
              };
            })
            .filter((marker): marker is PdfChordOverlayMarker =>
              Boolean(marker),
            );
          if (markers.length > 0) normalized[page] = markers;
        }
        setEditableChords(normalized);
        show(`Chord dimuat: ${file.name}`);
      } catch {
        show("Gagal membaca file chord.");
      }
    });
  };
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
  const goToNeighbor = (song: { id: string } | undefined) => {
    if (!song) return;
    if (midiPlayer.isPlaying()) autoplayRequestRef.current = true;
    navigate(`/kidung/${song.id}`);
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
    if (song) {
      // gyschordweb _forceAutoPlayNext: keep playing across song changes.
      if (midiPlayer.isPlaying()) autoplayRequestRef.current = true;
      navigate(`/kidung/${song.id}`);
    }
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
    // Mirror gyschordweb MidiEngine guards: isLoading/isSwitching + generation gate
    if (midiPlayer.isLoading() || isMidiSwitchingRef.current) {
      show(translate(locale, "kidung.loadingMidi"));
      return;
    }
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
          await midiPlayer.resumeContext();
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
    const thisGeneration = ++midiLoadGeneration.current;
    isMidiSwitchingRef.current = true;
    try {
      (window as unknown as { isMidiSwitching?: boolean }).isMidiSwitching =
        true;
    } catch {
      /* ignore */
    }
    setMidiStatus("loading");
    try {
      const preloaded = await midiPlayer.hasPreloaded(
        ref.sha256,
        transpose,
        midiSettings.instrument,
        midiSettings.tempo,
      );
      if (preloaded) {
        // No delay - match viewer-core navDelayMs=0
      }
      const rawUrl = `https://raw.githubusercontent.com/gyspnk/gyschordweb/${musicLock.sourceCommit}/docs/${ref.path}`;
      const bytes = await loadMusicAsset(ref);
      if (midiLoadGeneration.current !== thisGeneration) return;
      const loaded = await midiLoader.load({
        id: item.id,
        url: rawUrl,
        sourceHash: ref.sha256,
        bytes,
      });
      if (midiLoadGeneration.current !== thisGeneration) return;
      await midiPlayer.resumeContext();
      const songMeta = getHymnPdfMeta(item.id);
      const loadedIntoPlayer = await midiPlayer.load(
        item.id,
        item.title,
        loaded.midi,
        {
          rawMidi: bytes,
          sourceHash: ref.sha256,
          midiUrl: rawUrl,
          ...(songMeta?.tempo !== undefined ? { tempo: songMeta.tempo } : {}),
        },
      );
      if (midiLoadGeneration.current !== thisGeneration) return;
      if (!loadedIntoPlayer) return;
      const queueIndex = getMidiPlaylist().items.findIndex(
        (entry) => entry.songId === item.id,
      );
      if (queueIndex >= 0) selectMidiPlaylistItem(queueIndex);
      setMidiStatus("ready");
      show(translate(locale, "kidung.midiReadyHint"));
    } catch (error) {
      if (midiLoadGeneration.current !== thisGeneration) return;
      setMidiStatus("error");
      show(translate(locale, "kidung.midiUnavailable"));
      try {
        const { recordDiagnostic } = await import("./diagnostics.js");
        recordDiagnostic("warn", "kidung.midiLoad", error);
      } catch {
        /* ignore */
      }
    } finally {
      if (midiLoadGeneration.current === thisGeneration) {
        isMidiSwitchingRef.current = false;
        try {
          (window as unknown as { isMidiSwitching?: boolean }).isMidiSwitching =
            false;
        } catch {
          /* ignore */
        }
      }
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
    userSetTransposeRef.current = true;
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
            onClick={() => goToNeighbor(prev)}
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
            onClick={() => goToNeighbor(next)}
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
          <div className="gys-pdf-overlay">
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
                onClick={() => goToNeighbor(prev)}
                aria-label={translate(locale, "kidung.previous")}
              >
                <span aria-hidden="true">
                  <Icon name="chevronLeft" size={18} />
                </span>
                <span className="viewer-chrome-copy">
                  {translate(locale, "kidung.previous")}
                </span>
              </button>
              <div
                className="hymn-pdf-viewer-title"
                id="pdf-viewer-title-wrapper"
                ref={overlayTitleRef}
                onClick={handleTitleTap}
                title="Klik 5x untuk mengaktifkan mode edit chord"
              >
                <strong id="pdf-viewer-title">{item.title}</strong>
                <small id="pdf-viewer-number">
                  No. {numberLabel(item.number)}
                </small>
              </div>
              <button
                type="button"
                className="viewer-chrome-button"
                disabled={!next}
                onClick={() => goToNeighbor(next)}
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
              {chordEditorEnabled && (
                <div
                  className="chord-editor-toolbar"
                  role="toolbar"
                  aria-label="Chord editor"
                >
                  <strong className="chord-editor-label">
                    Chord Editor (Note-Aligned)
                  </strong>
                  <button
                    type="button"
                    className="viewer-chrome-button"
                    onClick={downloadEditorChords}
                  >
                    <span className="viewer-chrome-copy">Simpan</span>
                  </button>
                  <button
                    type="button"
                    className="viewer-chrome-button"
                    onClick={() => chordFileInput.current?.click()}
                  >
                    <span className="viewer-chrome-copy">Impor</span>
                  </button>
                  <input
                    ref={chordFileInput}
                    className="sr-only"
                    type="file"
                    accept=".json,.chord.json"
                    onChange={(event) => {
                      importEditorChords(event.target.files?.[0]);
                      event.currentTarget.value = "";
                    }}
                  />
                </div>
              )}
            </div>
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
                      midiState.songId === item.id &&
                      midiState.status === "playing"
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

              <div className="hymn-segmented-toolbar">
                {viewerMode !== "pdf" && (
                  <div
                    className="hymn-scope-pill-group"
                    role="group"
                    aria-label="Cakupan Bait"
                  >
                    <button
                      type="button"
                      className={`hymn-scope-pill-btn${viewScope === "all" ? " is-active" : ""}`}
                      onClick={() => updateViewScope("all")}
                      title="Tampilkan semua bait berurutan"
                      aria-pressed={viewScope === "all"}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      className={`hymn-scope-pill-btn${viewScope === "verse" ? " is-active" : ""}`}
                      onClick={() => updateViewScope("verse")}
                      title="Tampilkan bait per bait"
                      aria-pressed={viewScope === "verse"}
                    >
                      Bait {safeVerseIndex + 1}
                    </button>
                  </div>
                )}

                <div className="hymn-autoscroll-control">
                  <button
                    type="button"
                    className={`quiet-button hymn-autoscroll-btn${autoScrollActive ? " is-active" : ""}`}
                    onClick={() => setAutoScrollActive((a) => !a)}
                    title={
                      autoScrollActive
                        ? "Hentikan Gulir Otomatis"
                        : "Mulai Gulir Otomatis"
                    }
                    aria-label={
                      autoScrollActive
                        ? "Hentikan Gulir Otomatis"
                        : "Mulai Gulir Otomatis"
                    }
                    aria-pressed={autoScrollActive}
                  >
                    <span className="hymn-action-icon" aria-hidden="true">
                      <Icon
                        name={autoScrollActive ? "pause" : "play"}
                        size={16}
                      />
                    </span>
                    <span className="hymn-action-label">
                      {autoScrollActive
                        ? `Gulir ${autoScrollSpeed}Ã—`
                        : "Auto Scroll"}
                    </span>
                  </button>
                  {autoScrollActive && (
                    <select
                      className="hymn-autoscroll-speed-select"
                      value={autoScrollSpeed}
                      onChange={(e) =>
                        setAutoScrollSpeed(Number(e.target.value))
                      }
                      aria-label="Kecepatan gulir otomatis"
                    >
                      <option value={1}>1Ã—</option>
                      <option value={2}>2Ã—</option>
                      <option value={3}>3Ã—</option>
                      <option value={4}>4Ã—</option>
                      <option value={5}>5Ã—</option>
                    </select>
                  )}
                </div>
              </div>

              <details
                className="hymn-more-actions"
                name="hymn-text-toolbar-menu"
              >
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
                        {playlist.items.some(
                          (entry) => entry.songId === item.id,
                        )
                          ? translate(locale, "kidung.queueCount", {
                              count: playlist.items.length,
                            })
                          : translate(locale, "kidung.queueAdd")}
                      </span>
                    </button>
                  )}
                  {!item.assetCode && (
                    <button
                      type="button"
                      className="quiet-button hymn-action"
                      onClick={() => {
                        const added = addSongToActivePlaylist(item.id);
                        show(
                          added
                            ? "Ditambahkan ke playlist aktif"
                            : "Playlist aktif belum dibuat; simpan dulu di halaman Playlist.",
                        );
                      }}
                    >
                      <span className="hymn-action-icon" aria-hidden="true">
                        <Icon name="bookmark" size={17} />
                      </span>
                      <span className="hymn-action-label">
                        Simpan ke playlist
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
                        <span>
                          {translate(locale, "kidung.activeSoundfont")}
                        </span>
                        <strong>GeneralUser-GS</strong>
                      </output>
                      {midiState.status === "loading" && (
                        <div
                          className="midi-preload-bar"
                          role="progressbar"
                          aria-valuenow={midiState.loadingProgress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          style={{
                            height: 4,
                            background: "rgba(141,110,63,0.18)",
                            borderRadius: 999,
                            overflow: "hidden",
                            margin: "6px 0",
                          }}
                        >
                          <div
                            className="midi-preload-fill"
                            style={{
                              width: `${Math.max(4, midiState.loadingProgress)}%`,
                              height: "100%",
                              background: "var(--accent, #8d6e3f)",
                              transition: "width 0.2s ease",
                            }}
                          />
                        </div>
                      )}
                      {(midiState.songId === item.id &&
                        (midiState.status === "playing" ||
                          midiState.status === "paused" ||
                          midiState.status === "ready" ||
                          midiState.status === "stopped")) ||
                      midiState.status === "loading" ? (
                        midiState.duration > 0 ? (
                          <div
                            className="hymn-midi-seekbar"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              margin: "6px 0",
                            }}
                          >
                            <span
                              className="hymn-midi-time"
                              style={{
                                fontVariantNumeric: "tabular-nums",
                                fontSize: "0.8rem",
                                minWidth: 32,
                                textAlign: "right",
                              }}
                            >
                              {formatMidiTime(midiState.position)}
                            </span>
                            <input
                              className="hymn-midi-seek-input"
                              type="range"
                              min={0}
                              max={midiState.duration || 100}
                              step={0.1}
                              value={Math.min(
                                midiState.position,
                                midiState.duration || 100,
                              )}
                              onChange={(event) => {
                                const v = Number(event.target.value);
                                if (Number.isFinite(v))
                                  void midiPlayer
                                    .seek(v)
                                    .catch(() => undefined);
                              }}
                              style={{ flex: 1 }}
                              aria-label="Posisi MIDI"
                              disabled={
                                midiState.status === "loading" ||
                                isMidiSwitchingRef.current
                              }
                            />
                            <span
                              className="hymn-midi-time"
                              style={{
                                fontVariantNumeric: "tabular-nums",
                                fontSize: "0.8rem",
                                minWidth: 32,
                              }}
                            >
                              {formatMidiTime(midiState.duration)}
                            </span>
                          </div>
                        ) : null
                      ) : null}
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
                              {String(program + 1).padStart(3, "0")} Â· {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="hymn-tempo-control">
                        <span>{translate(locale, "kidung.tempo")}</span>
                        <button
                          type="button"
                          onPointerDown={() =>
                            holdStart(
                              () =>
                                void midiPlayer.setTempo(
                                  midiSettings.tempo - 2,
                                ),
                            )
                          }
                          onPointerUp={holdStop}
                          onPointerLeave={holdStop}
                          onPointerCancel={holdStop}
                          onClick={() =>
                            void midiPlayer.setTempo(midiSettings.tempo - 2)
                          }
                          aria-label={translate(locale, "kidung.tempoDown")}
                        >
                          âˆ’
                        </button>
                        <input
                          type="number"
                          min={30}
                          max={220}
                          value={midiSettings.tempo}
                          onChange={(event) => {
                            const v = Number(event.target.value);
                            if (Number.isFinite(v))
                              void midiPlayer
                                .setTempo(v)
                                .catch(() => undefined);
                          }}
                          onBlur={(event) => {
                            const v = Number(event.target.value);
                            if (!Number.isFinite(v))
                              void midiPlayer
                                .setTempo(midiSettings.tempo)
                                .catch(() => undefined);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              (event.target as HTMLInputElement).blur();
                          }}
                          aria-label="Tempo BPM"
                          style={{ width: 56, textAlign: "center" }}
                        />
                        <span style={{ fontSize: "0.8rem" }}>BPM</span>
                        <button
                          type="button"
                          onPointerDown={() =>
                            holdStart(
                              () =>
                                void midiPlayer.setTempo(
                                  midiSettings.tempo + 2,
                                ),
                            )
                          }
                          onPointerUp={holdStop}
                          onPointerLeave={holdStop}
                          onPointerCancel={holdStop}
                          onClick={() =>
                            void midiPlayer.setTempo(midiSettings.tempo + 2)
                          }
                          aria-label={translate(locale, "kidung.tempoUp")}
                        >
                          +
                        </button>
                      </div>
                      <div
                        className="hymn-midi-volume"
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginTop: 6,
                        }}
                      >
                        <span style={{ fontSize: "0.75rem", minWidth: 48 }}>
                          Volume
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          value={midiState.muted ? 0 : midiState.volume}
                          onChange={(e) =>
                            void midiPlayer
                              .setVolume(Number(e.target.value))
                              .catch(() => undefined)
                          }
                          style={{ flex: 1 }}
                          aria-label="Volume MIDI"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            void midiPlayer
                              .setMuted(!midiState.muted)
                              .catch(() => undefined)
                          }
                          aria-label={midiState.muted ? "Unmute" : "Mute"}
                          style={{ fontSize: "0.8rem" }}
                        >
                          {midiState.muted ? "ðŸ”‡" : "ðŸ”Š"}
                        </button>
                      </div>
                    </div>
                  )}
                  <Select
                    value={keyIndex}
                    onChange={(value) => {
                      setKeyIndex(value);
                      updateTranspose(
                        transposeBetweenKeys(sourceKeyIndex, value),
                      );
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
                      {
                        value: "sharp",
                        label: translate(locale, "kidung.sharp"),
                      },
                      {
                        value: "flat",
                        label: translate(locale, "kidung.flat"),
                      },
                    ]}
                  />
                  <div className="transpose-control">
                    <span>
                      Nada tampil Â· {renderedKey}
                      {capo > 0
                        ? ` (Bentuk: ${chordKeyName((((sourceKeyIndex + transpose - capo) % 12) + 12) % 12, accidental)})`
                        : ""}
                    </span>
                    <div className="transpose-btn-group">
                      <button
                        type="button"
                        onPointerDown={() =>
                          holdStart(() => updateTranspose(transpose - 1))
                        }
                        onPointerUp={holdStop}
                        onPointerLeave={holdStop}
                        onPointerCancel={holdStop}
                        onClick={() => updateTranspose(transpose - 1)}
                        aria-label={translate(locale, "kidung.transposeDown")}
                      >
                        âˆ’
                      </button>
                      <strong>
                        {transpose > 0 ? `+${transpose}` : transpose}
                      </strong>
                      <button
                        type="button"
                        onPointerDown={() =>
                          holdStart(() => updateTranspose(transpose + 1))
                        }
                        onPointerUp={holdStop}
                        onPointerLeave={holdStop}
                        onPointerCancel={holdStop}
                        onClick={() => updateTranspose(transpose + 1)}
                        aria-label={translate(locale, "kidung.transposeUp")}
                      >
                        +
                      </button>
                      {transpose !== 0 && (
                        <button
                          type="button"
                          className="transpose-reset-btn"
                          onClick={() => updateTranspose(0)}
                          title="Reset Transpose"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="capo-control">
                    <span>
                      Capo Â· {capo === 0 ? "Tanpa Capo" : `Fret ${capo}`}
                    </span>
                    <div className="capo-btn-group">
                      <button
                        type="button"
                        onPointerDown={() =>
                          holdStart(() => setCapo((c) => Math.max(0, c - 1)))
                        }
                        onPointerUp={holdStop}
                        onPointerLeave={holdStop}
                        onPointerCancel={holdStop}
                        onClick={() => setCapo((c) => Math.max(0, c - 1))}
                        disabled={capo <= 0}
                        aria-label="Turunkan Capo"
                      >
                        âˆ’
                      </button>
                      <strong>{capo === 0 ? "0" : capo}</strong>
                      <button
                        type="button"
                        onPointerDown={() =>
                          holdStart(() => setCapo((c) => Math.min(11, c + 1)))
                        }
                        onPointerUp={holdStop}
                        onPointerLeave={holdStop}
                        onPointerCancel={holdStop}
                        onClick={() => setCapo((c) => Math.min(11, c + 1))}
                        disabled={capo >= 11}
                        aria-label="Naikkan Capo"
                      >
                        +
                      </button>
                      {capo > 0 && (
                        <button
                          type="button"
                          className="transpose-reset-btn"
                          onClick={() => setCapo(0)}
                          title="Matikan Capo"
                        >
                          Reset
                        </button>
                      )}
                    </div>
                  </div>
                  <div
                    className="reader-preferences"
                    aria-label={translate(locale, "kidung.textSettings")}
                  >
                    <span>{translate(locale, "kidung.text")}</span>
                    <button
                      type="button"
                      onPointerDown={() =>
                        holdStart(() =>
                          updateTypography({
                            fontSize: typography.fontSize - 1,
                          }),
                        )
                      }
                      onPointerUp={holdStop}
                      onPointerLeave={holdStop}
                      onPointerCancel={holdStop}
                      onClick={() =>
                        updateTypography({ fontSize: typography.fontSize - 1 })
                      }
                      aria-label={translate(locale, "kidung.decreaseText")}
                    >
                      Aâˆ’
                    </button>
                    <output aria-live="polite">
                      {Math.round(typography.fontSize)} px
                    </output>
                    <button
                      type="button"
                      onPointerDown={() =>
                        holdStart(() =>
                          updateTypography({
                            fontSize: typography.fontSize + 1,
                          }),
                        )
                      }
                      onPointerUp={holdStop}
                      onPointerLeave={holdStop}
                      onPointerCancel={holdStop}
                      onClick={() =>
                        updateTypography({ fontSize: typography.fontSize + 1 })
                      }
                      aria-label={translate(locale, "kidung.increaseText")}
                    >
                      A+
                    </button>
                    <button
                      type="button"
                      onPointerDown={() =>
                        holdStart(() =>
                          updateTypography({
                            lineHeight: typography.lineHeight - 0.1,
                          }),
                        )
                      }
                      onPointerUp={holdStop}
                      onPointerLeave={holdStop}
                      onPointerCancel={holdStop}
                      onClick={() =>
                        updateTypography({
                          lineHeight: typography.lineHeight - 0.1,
                        })
                      }
                      aria-label={translate(locale, "kidung.decreaseSpacing")}
                    >
                      âˆ’ Spasi
                    </button>
                    <button
                      type="button"
                      onPointerDown={() =>
                        holdStart(() =>
                          updateTypography({
                            lineHeight: typography.lineHeight + 0.1,
                          }),
                        )
                      }
                      onPointerUp={holdStop}
                      onPointerLeave={holdStop}
                      onPointerCancel={holdStop}
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
            {viewerMode !== "pdf" &&
              (viewScope === "all" ? (
                <div className="hymn-all-verses-container">
                  {verses.map((verseText, vIdx) => {
                    const vLines = verseText.split("\n");
                    const vChordLines = allVersesChordLines[vIdx] ?? [];
                    return (
                      <article
                        key={`${item.id}-verse-${vIdx}`}
                        className="lyrics-sheet is-continuous"
                        style={{
                          fontSize: `${fitFontSize}px`,
                          lineHeight: typography.lineHeight,
                        }}
                      >
                        <div className="hymn-verse-header">
                          <span className="hymn-verse-number-badge">
                            Bait {vIdx + 1}
                          </span>
                        </div>
                        {vLines.map((line, index) => {
                          const chordLine = chordsVisible
                            ? vChordLines[index]
                            : undefined;
                          return (
                            <p key={`${index}-${line}`}>
                              {chordLine && chordLine.chords.length > 0 ? (
                                <ChordCapability
                                  lines={[chordLine]}
                                  transpose={transpose - capo}
                                  accidental={accidental}
                                />
                              ) : (
                                line || "Â "
                              )}
                            </p>
                          );
                        })}
                      </article>
                    );
                  })}
                </div>
              ) : (
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
                    const chordLine = chordsVisible
                      ? chordLines[index]
                      : undefined;
                    return (
                      <p key={`${index}-${line}`}>
                        {chordLine && chordLine.chords.length > 0 ? (
                          <ChordCapability
                            lines={[chordLine]}
                            transpose={transpose - capo}
                            accidental={accidental}
                          />
                        ) : (
                          line || "Â "
                        )}
                      </p>
                    );
                  })}
                </article>
              ))}
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
                  chordOverlays={
                    chordEditorEnabled ? editableChords : pdfChordOverlays
                  }
                  chordsVisible={chordsVisible}
                  editorEnabled={chordEditorEnabled}
                  onEditChord={editChordAt}
                />
              </Suspense>
            )}
          </div>
        )}
        {viewerMode !== "pdf" && (
          <nav
            className="hymn-text-footer"
            aria-label={translate(locale, "kidung.verseNavigation")}
          >
            <button
              type="button"
              disabled={!prev}
              onClick={() => goToNeighbor(prev)}
              aria-label={translate(locale, "kidung.previous")}
              title="Lagu Sebelumnya"
            >
              <Icon name="skipPrevious" size={19} />
            </button>
            {viewScope === "verse" ? (
              <>
                <button
                  type="button"
                  disabled={safeVerseIndex === 0}
                  onClick={() => changeVerse(-1)}
                  aria-label={translate(locale, "kidung.previousVerse")}
                  title="Bait Sebelumnya"
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
                  title="Bait Berikutnya"
                >
                  <Icon name="chevronRight" size={19} />
                </button>
              </>
            ) : (
              <span className="hymn-all-verses-summary">
                {verses.length} Bait Lengkap
              </span>
            )}
            <button
              type="button"
              disabled={!next}
              onClick={() => goToNeighbor(next)}
              aria-label={translate(locale, "kidung.next")}
              title="Lagu Berikutnya"
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
