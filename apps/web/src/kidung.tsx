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
  type TouchEvent,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
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
  prefetchMusicAsset,
  resolveMusicAssetUrl,
} from "./music-assets.js";
import { midiPlayer } from "./midi-player.js";
import { speechPlayer } from "./speech-player.js";
import { Select } from "./select.js";
import { isFavorite, subscribeFavorites, toggleFavorite } from "./favorites.js";
import { getActivity, setHymnActivity } from "./history.js";
import { loadForkHymnalPdf } from "./fork-pdf.js";
import { buildHymnSearchIndex, searchHymns } from "./hymn-search.js";
import {
  addMidiPlaylistItem,
  getMidiPlaylist,
  selectMidiPlaylistItem,
  subscribeMidiPlaylist,
} from "./midi-playlist.js";
import { hapticTick } from "./haptics.js";
import { useReadingToolbarAutoHide } from "./use-toolbar-auto-hide.js";
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
  source: "fork" | "canonical";
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
    void fetch(`${import.meta.env.BASE_URL}offline/hymn-catalog.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Offline hymn catalog unavailable");
        setCatalog({
          status: "ready",
          items: parseCatalog(await response.json()),
        });
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
    return () => controller.abort();
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
    const key = `${item.number}:${item.title.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function KidungPage({ locale }: { locale: Locale }) {
  const { songId } = useParams();
  const { catalog, musicLock } = useHymnData();
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
  const items = useMemo(
    () => (state.status === "ready" ? uniqueItems(state.items) : []),
    [state],
  );
  const searchIndex = useMemo(() => buildHymnSearchIndex(items), [items]);
  const books = useMemo(
    () => [...new Set(items.map((item) => item.book))].sort(),
    [items],
  );
  const filtered = useMemo(() => {
    return searchHymns(searchIndex, deferredQuery, book);
  }, [book, deferredQuery, searchIndex]);
  return (
    <div className="page hymn-page">
      <section className="page-intro">
        <div>
          <p className="date-line">
            {items.length > 0
              ? `${items.length} lagu · ${translate(locale, "kidung.catalogCanonical")}`
              : translate(locale, "kidung.catalogCanonical")}
          </p>
          <h1>{translate(locale, "page.kidungTitle")}</h1>
          <p className="intro-copy">
            {translate(locale, "kidung.catalogIntro")}
          </p>
        </div>
        <span className="pack-badge">
          {items.length > 0
            ? `${translate(locale, "kidung.catalogOffline")} · ${items.length}`
            : translate(locale, "kidung.catalogOffline")}
        </span>
      </section>
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
          <div className="catalog-toolbar">
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
          <div className="catalog-heading">
            <div>
              <p className="date-line">
                {translate(locale, "kidung.catalogHeading")}
              </p>
              <h2>
                {translate(locale, "kidung.available", {
                  count: filtered.length,
                })}
              </h2>
            </div>
            <small>{translate(locale, "kidung.catalogHint")}</small>
          </div>
          <ol className="pujian-list">
            {filtered.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="pujian-row"
                  onClick={() => navigate(`/kidung/${item.id}`)}
                >
                  <span className="pujian-number">
                    {numberLabel(item.number)}
                  </span>
                  <span className="pujian-copy">
                    <strong>{item.title}</strong>
                    <small>
                      {item.book} · {item.verses.length} bait · PDF{" "}
                      {item.pdfPath
                        ? translate(locale, "kidung.pdfAvailable")
                        : "—"}
                    </small>
                  </span>
                  <span className="pujian-arrow" aria-hidden="true">
                    ›
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
  const [viewerMode, setViewerMode] = useState<HymnViewerMode>(() =>
    readHymnViewerMode(songId),
  );
  const [pdfUrl, setPdfUrl] = useState<string>();
  const [pdfBytes, setPdfBytes] = useState<Uint8Array>();
  const [pdfInitialPage, setPdfInitialPage] = useState(1);
  const [pdfPageCount, setPdfPageCount] = useState<number>();
  const [pdfSource, setPdfSource] = useState<"fork" | "canonical">("fork");
  const [pdfVersion, setPdfVersion] = useState<string>();
  const [pdfStatus, setPdfStatus] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [notice, setNotice] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [playlist, setPlaylist] = useState(() => getMidiPlaylist());
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(
    null,
  );
  const touchStartX = useRef<number | undefined>(undefined);
  const { toolbarVisible, restoreToolbar } = useReadingToolbarAutoHide();
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
  const verses = getHymnVerses(item);
  const safeVerseIndex = Math.min(verseIndex, Math.max(0, verses.length - 1));
  const sequence = state.status === "ready" ? uniqueItems(state.items) : [];
  const index = item
    ? sequence.findIndex((candidate) => candidate.id === item.id)
    : -1;
  const prev = index > 0 ? sequence[index - 1] : undefined;
  const next = index >= 0 ? sequence[index + 1] : undefined;
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
      if (candidate.id !== next?.id) {
        void prefetchMusicAsset(ref);
        continue;
      }
      // The next song gets the complete warm path: binary -> parser -> PCM.
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
  }, [chordRepository, item, midiLoader, musicLock, next, prev]);
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
    fitFontSize,
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

  const onTouchStart = (event: TouchEvent) => {
    restoreToolbar();
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (!touch) return;
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
  };

  const onTouchEnd = (event: TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;
    const elapsed = Date.now() - touchStartRef.current.time;
    touchStartRef.current = null;

    if (
      Math.abs(deltaX) > 50 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.5 &&
      elapsed < 600
    ) {
      if (deltaX < 0 && next) {
        hapticTick("light");
        navigate(`/kidung/${next.id}`);
      } else if (deltaX > 0 && prev) {
        hapticTick("light");
        navigate(`/kidung/${prev.id}`);
      }
    }
  };

  const onVerseTouchStart = (event: TouchEvent<HTMLElement>) => {
    if (event.touches.length === 1)
      touchStartX.current = event.touches[0]?.clientX;
  };
  const onVerseTouchEnd = (event: TouchEvent<HTMLElement>) => {
    const start = touchStartX.current;
    touchStartX.current = undefined;
    if (start === undefined) return;
    const end = event.changedTouches[0]?.clientX;
    if (end === undefined || Math.abs(end - start) < 56) return;
    setVerseIndex((current) =>
      Math.max(
        0,
        Math.min(verses.length - 1, current + (end < start ? 1 : -1)),
      ),
    );
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
    <div className="page hymn-detail-page">
      <div className="detail-back">
        <Link className="text-button" to="/kidung">
          {translate(locale, "kidung.back")}
        </Link>
        <span>
          {numberLabel(item.number)} · {item.book}
        </span>
      </div>
      <section className="detail-hero">
        <div>
          <p className="date-line">
            {translate(locale, "kidung.canonicalNumber", {
              number: numberLabel(item.number),
            })}
          </p>
          <h1>{item.title}</h1>
          <p className="intro-copy">
            {translate(locale, "kidung.detailIntro")}
          </p>
        </div>
        <div className="detail-neighbors">
          <button
            type="button"
            className="quiet-button"
            disabled={!prev}
            onClick={() => prev && navigate(`/kidung/${prev.id}`)}
          >
            {translate(locale, "kidung.previous")}
          </button>
          <button
            type="button"
            className="quiet-button"
            disabled={!next}
            onClick={() => next && navigate(`/kidung/${next.id}`)}
          >
            {translate(locale, "kidung.next")}
          </button>
        </div>
      </section>
      <section
        className="hymn-detail-surface"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        onClick={restoreToolbar}
      >
        <div
          className={`detail-actions${toolbarVisible ? "" : " is-collapsed"}`}
        >
          <button
            type="button"
            className="quiet-button hymn-action"
            onClick={toggleChords}
            disabled={chordStatus === "loading"}
            aria-pressed={chordsVisible}
          >
            <span className="hymn-action-icon" aria-hidden="true">
              ♫
            </span>
            <span className="hymn-action-label">
              {chordStatus === "loading"
                ? translate(locale, "kidung.loadingChord")
                : chordsVisible
                  ? translate(locale, "kidung.hideChord")
                  : translate(locale, "kidung.showChord")}
            </span>
          </button>
          <button
            type="button"
            className="quiet-button hymn-action"
            onClick={toggle}
            aria-pressed={favorite}
          >
            <span className="hymn-action-icon" aria-hidden="true">
              {favorite ? "★" : "☆"}
            </span>
            <span className="hymn-action-label">
              {favorite
                ? translate(locale, "kidung.favorite")
                : translate(locale, "kidung.saveFavorite")}
            </span>
          </button>
          <button
            type="button"
            className="primary-button hymn-action"
            onClick={() => void loadMidi()}
            disabled={
              midiStatus === "loading" || midiState.status === "loading"
            }
          >
            <span className="hymn-action-icon" aria-hidden="true">
              {midiState.songId === item.id && midiState.status === "playing"
                ? "❚❚"
                : "▶"}
            </span>
            <span className="hymn-action-label">
              {midiState.songId === item.id && midiState.status === "playing"
                ? translate(locale, "kidung.pauseMidi")
                : midiStatus === "loading"
                  ? translate(locale, "kidung.loadingMidi")
                  : midiStatus === "ready"
                    ? translate(locale, "kidung.midiReady")
                    : translate(locale, "kidung.playMidi")}
            </span>
          </button>
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
              ≡
            </span>
            <span className="hymn-action-label">
              {playlist.items.some((entry) => entry.songId === item.id)
                ? translate(locale, "kidung.queueCount", {
                    count: playlist.items.length,
                  })
                : translate(locale, "kidung.queueAdd")}
            </span>
          </button>
          <button
            type="button"
            className="quiet-button hymn-action"
            onClick={() =>
              viewerMode === "pdf"
                ? selectViewerMode("lyrics")
                : selectViewerMode("pdf")
            }
            disabled={pdfStatus === "loading"}
          >
            <span className="hymn-action-icon" aria-hidden="true">
              ▧
            </span>
            <span className="hymn-action-label">
              {pdfStatus === "loading"
                ? translate(locale, "kidung.loadingPdf")
                : viewerMode === "pdf"
                  ? translate(locale, "kidung.closePdf")
                  : translate(locale, "kidung.openPdf")}
            </span>
          </button>
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
              }}
            >
              <span className="hymn-action-icon" aria-hidden="true">
                ↓
              </span>
              <span className="hymn-action-label">
                {translate(locale, "kidung.downloadPdf")}
              </span>
            </button>
          )}
        </div>
        <div className="song-controls">
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
                updateTypography({ lineHeight: typography.lineHeight - 0.1 })
              }
              aria-label={translate(locale, "kidung.decreaseSpacing")}
            >
              − Spasi
            </button>
            <button
              type="button"
              onClick={() =>
                updateTypography({ lineHeight: typography.lineHeight + 0.1 })
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
        <div className="verse-switcher">
          <span>{translate(locale, "kidung.verse")}</span>
          <div className="verse-tabs" role="tablist">
            {verses.map((_, index) => (
              <button
                type="button"
                role="tab"
                aria-selected={index === safeVerseIndex}
                className={index === safeVerseIndex ? "is-active" : ""}
                key={index}
                onClick={() => setVerseIndex(index)}
              >
                {index + 1}
              </button>
            ))}
          </div>
          <Select
            value={safeVerseIndex}
            onChange={setVerseIndex}
            label={translate(locale, "kidung.chooseVerse")}
            options={verses.map((_, index) => ({
              value: index,
              label: translate(locale, "kidung.verseOption", {
                number: index + 1,
              }),
            }))}
          />
        </div>
        <div
          className="viewer-mode-tabs"
          role="tablist"
          aria-label={translate(locale, "kidung.viewerMode")}
        >
          {(
            [
              ["lyrics", translate(locale, "kidung.lyrics")],
              ["pdf", "PDF"],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              role="tab"
              aria-selected={viewerMode === mode}
              className={
                viewerMode === mode
                  ? "viewer-mode-tab is-active"
                  : "viewer-mode-tab"
              }
              onClick={() => selectViewerMode(mode)}
              disabled={mode === "pdf" && pdfStatus === "loading"}
            >
              {mode === "pdf" && pdfStatus === "loading"
                ? translate(locale, "kidung.loadingPdf")
                : label}
            </button>
          ))}
        </div>
        {viewerMode === "lyrics" && (
          <article
            className="lyrics-sheet verse-enter"
            key={`${item.id}-${safeVerseIndex}`}
            ref={lyricsRef}
            aria-label={`${item.title}, bait ${safeVerseIndex + 1}`}
            style={{
              fontSize: `${fitFontSize}px`,
              lineHeight: typography.lineHeight,
            }}
            data-autofit-font-size={fitFontSize}
            onTouchStart={onVerseTouchStart}
            onTouchEnd={onVerseTouchEnd}
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
              chordOverlays={pdfChordOverlays}
              chordsVisible={chordsVisible}
            />
          </Suspense>
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
