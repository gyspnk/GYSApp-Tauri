import { LoadingProgress } from "./loading-progress.js";
import { transitionReader } from "./reader-transition.js";
import {
  lazy,
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  type ChordDocumentV2,
  type HymnCatalogEntry,
  type UpstreamMusicLock,
} from "@gys/contracts";
import { ChordNotAvailableError, MidiLoader } from "@gys/domain";
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
  loadMusicLock,
} from "./music-assets.js";
import { midiPlayer } from "./midi-player.js";
import { HymnMidiProgress } from "./kidung-midi-progress.js";
import { createSnapshotSelector } from "./snapshot-selector.js";

const readMidiReaderState = createSnapshotSelector(
  midiPlayer.snapshot,
  ({ position: _position, ...reader }) => reader,
);
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";
import { speechPlayer } from "./speech-player.js";
import { Select } from "./select.js";
import { Icon } from "./icons.js";
import { isFavorite, subscribeFavorites, toggleFavorite } from "./favorites.js";
import { getActivity, setHymnActivity } from "./history.js";
import { loadForkHymnalPdf } from "./fork-pdf.js";
import { loadInstalledDistributedHymnalPdf } from "./distributed-hymnals.js";
import {
  getHymnPdfMeta,
  resolveHymnMidiDefaults,
  warmHymnPdfMeta,
} from "./hymn-pdf-meta.js";
import { readHymnViewerPrefs } from "./hymn-viewer-prefs.js";
import { observeSingleLineFit } from "./text-fit.js";
import { getDistributedAssetManager } from "./distributed-asset-manager.js";
import {
  addMidiPlaylistItem,
  getMidiPlaylist,
  selectMidiPlaylistItem,
  subscribeMidiPlaylist,
} from "./midi-playlist.js";
import { addSongToActivePlaylist } from "./kidung-playlists.js";
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
  MIN_HYMN_FONT_SIZE,
  MAX_HYMN_FONT_SIZE,
  clampHymnFontSize,
  readHymnTypography,
  hasHymnTypography,
  readNaturalChordPreference,
  writeHymnTypography,
  type HymnTypography,
} from "./hymn-preferences.js";
import { autoFitFontSize } from "./hymn-autofit.js";
import { LyricsPanel } from "./lyrics-panel.js";
import {
  type CatalogState,
  numberLabel,
  formatMidiTime,
  uniqueItems,
} from "./kidung-shared.js";
import { MidiControlsPanel } from "./kidung-midi-controls.js";
const PdfReader = lazy(() =>
  import("./pdf.js").then(({ PdfReader: Component }) => ({
    default: Component,
  })),
);

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

export function HymnDetail({
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
  const [searchParams] = useSearchParams();
  const requestedMode = searchParams.get("mode");
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
    "idle" | "loading" | "ready" | "error" | "unavailable"
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
    requestedMode === "pdf" || requestedMode === "lyrics"
      ? requestedMode
      : readHymnViewerMode(songId),
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
  const [midiDockOpen, setMidiDockOpen] = useState(false);
  const [chordEditorEnabled, setChordEditorEnabled] = useState(false);
  const [lyricsPanelOpen, setLyricsPanelOpen] = useState(false);
  const [pdfKeyMenuOpen, setPdfKeyMenuOpen] = useState(false);
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
  // gyschordweb-style press-and-hold steppers: a quick tap must fire the step
  // exactly once, so a hold that just ended suppresses the trailing click.
  const lastHoldAt = useRef(0);
  const holdStart = (fn: () => void) => {
    holdState.current.timeout = window.setTimeout(() => {
      fn();
      lastHoldAt.current = Date.now();
      holdState.current.interval = window.setInterval(() => {
        fn();
        lastHoldAt.current = Date.now();
      }, 90);
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
  /** onClick wrapper for buttons that also support press-and-hold. */
  const tapStep = (fn: () => void) => () => {
    if (Date.now() - lastHoldAt.current < 350) return;
    fn();
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
    readMidiReaderState,
    readMidiReaderState,
  );
  const midiAvailable = !item?.assetCode;
  const midiPlayerEnabled =
    midiStatus === "loading" ||
    Boolean(midiState.songId && midiState.status !== "idle");
  const verses = useMemo(() => getHymnVerses(item), [item]);
  const safeVerseIndex = Math.min(verseIndex, Math.max(0, verses.length - 1));
  const sequence = useMemo(
    () => (state.status === "ready" ? uniqueItems(state.items) : []),
    [state],
  );
  const index = item
    ? sequence.findIndex((candidate) => candidate.id === item.id)
    : -1;
  // gyschordweb wrap-around navigation (number mode: last → first).
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
  // gyschordweb `_resolveSongTempoForLoad`: the per-song PDF tempo/key cache
  // is warmed only when a PDF- or MIDI-backed feature is explicitly used so
  // text-first hymn pages do not download PDF.js or the master PDF eagerly.
  // (see loadChord / loadMidi)

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
    const hasTransposePreference = midiPlayer.hasTransposePreference();
    userSetTransposeRef.current = hasTransposePreference;
    const meta = getHymnPdfMeta(songId);
    const natural = readNaturalChordPreference();
    const baseTranspose = hasTransposePreference
      ? midiPlayer.settingsSnapshot().transpose
      : resolveHymnMidiDefaults(meta, natural).transpose;
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
    if (midiPlayer.snapshot().songId !== songId) return;
    if (midiSettings.transpose !== transpose) {
      transposeRef.current = midiSettings.transpose;
      setTranspose(midiSettings.transpose);
      setKeyIndex((((sourceKeyIndex + midiSettings.transpose) % 12) + 12) % 12);
    }
  }, [midiSettings.transpose, songId, sourceKeyIndex, transpose]);
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
      { maxPx: 16, minPx: 11 },
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
        void loadMusicAsset(pdfRef).catch(() => undefined);
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
    const saved = viewerMode;
    if (saved === "pdf" && pdfStatus === "idle") void loadPdf();
    if (chordsVisible && chordStatus === "idle") void loadChord();
  }, [item, chordStatus, chordsVisible, pdfStatus]);
  useEffect(() => {
    const updated = (event: Event) => {
      if (
        (event as CustomEvent<{ songId: string }>).detail.songId === item?.id &&
        chordsVisible
      )
        void loadChord();
    };
    window.addEventListener("gys-chords-updated", updated);
    return () => window.removeEventListener("gys-chords-updated", updated);
  }, [item?.id, chordsVisible]);
  const lyricLines = (verses[safeVerseIndex] ?? "").split("\n");
  const lyricText = lyricLines.join("\n");
  const chordLines = useMemo(
    () =>
      matchChordLinesToLyrics(
        lyricLines,
        chordDocument,
        chordLayout,
        safeVerseIndex,
        verses,
      ),
    [chordDocument, chordLayout, safeVerseIndex, lyricText, verses],
  );
  const allVersesChordLines = useMemo(() => {
    if (!chordDocument) return [];
    return verses.map((verseText, vIdx) => {
      const lines = verseText.split("\n");
      return matchChordLinesToLyrics(
        lines,
        chordDocument,
        chordLayout,
        vIdx,
        verses,
      );
    });
  }, [chordDocument, chordLayout, verses]);

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

  useEffect(() => {
    if (viewerMode !== "lyrics") return;
    const element = lyricsRef.current;
    if (!element) return;
    let target = readHymnTypography(songId).fontSize;
    let timer: number | undefined;
    const wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      if (timer === undefined)
        target = parseFloat(getComputedStyle(element).fontSize) || target;
      const units =
        event.deltaMode === 1
          ? 16
          : event.deltaMode === 2
            ? element.clientHeight
            : 1;
      target = clampHymnFontSize(
        target * Math.exp(-event.deltaY * units * 0.002),
      );
      setFitFontSize(target);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = undefined;
        setTypography((current) =>
          writeHymnTypography(songId, { ...current, fontSize: target }),
        );
      }, 180);
    };
    element.addEventListener("wheel", wheel, { passive: false });
    return () => {
      element.removeEventListener("wheel", wheel);
      if (timer !== undefined) {
        window.clearTimeout(timer);
        writeHymnTypography(songId, {
          ...readHymnTypography(songId),
          fontSize: target,
        });
      }
    };
  }, [songId, item?.id, viewerMode, safeVerseIndex, viewScope]);

  useLayoutEffect(() => {
    if (viewerMode !== "lyrics") return;
    const element = lyricsRef.current;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const adaptive =
        Math.round(
          Math.max(
            18,
            Math.min(
              44,
              Math.sqrt(element.clientWidth * element.clientHeight) * 0.05,
            ),
          ) * 10,
        ) / 10;
      const preferred = hasHymnTypography(songId)
        ? typography.fontSize
        : adaptive;
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      let lineFit = preferred;
      if (context && !hasHymnTypography(songId)) {
        const style = getComputedStyle(element);
        context.font = `${style.fontWeight} ${preferred}px ${style.fontFamily}`;
        const lines = Array.from(element.querySelectorAll("p"));
        const widest = Math.max(
          1,
          ...lines.map(
            (line) =>
              context.measureText(
                line.querySelector(".chord-text-layer")?.textContent ??
                  line.textContent ??
                  "",
              ).width,
          ),
        );
        lineFit = Math.max(
          16,
          Math.min(
            preferred,
            (preferred * (element.clientWidth - 12)) / widest,
          ),
        );
      }
      element.style.fontSize = `${lineFit}px`;
      const next = hasHymnTypography(songId)
        ? clampHymnFontSize(lineFit)
        : autoFitFontSize({
            preferredFontSize: lineFit,
            availableWidth: element.clientWidth,
            measuredWidth: element.scrollWidth,
            availableHeight: element.clientHeight,
            measuredHeight: element.scrollHeight,
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
      "Masukkan chord (contoh: C, C♯, B♭, Fdim, Aadd9).\nKosongkan untuk hapus chord di posisi ini.",
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
      `${numberLabel(item?.number ?? 0, item?.id)}_${(item?.title ?? "kidung").replace(/[^\w -]/g, "")}.chord.json`.replace(
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
          <LoadingProgress label={translate(locale, "kidung.catalogLoading")} />
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
    transitionReader(() => navigate(`/kidung/${song.id}?mode=${viewerMode}`));
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
      transitionReader(() => setVerseIndex(target));
      return;
    }
    const song = delta > 0 ? next : prev;
    if (song) {
      // gyschordweb _forceAutoPlayNext: keep playing across song changes.
      if (midiPlayer.isPlaying()) autoplayRequestRef.current = true;
      transitionReader(() => navigate(`/kidung/${song.id}?mode=${viewerMode}`));
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
        fontSize: fitFontSize,
        nextFontSize: fitFontSize,
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
    const nextFontSize = clampHymnFontSize(
      pinch.fontSize * (pointerDistance() / pinch.distance),
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
      const resolvedPdfRef =
        musicPdfRef ??
        findMusicAsset(await loadMusicLock(), "pdf", item.pdfPath);
      if (!resolvedPdfRef) throw forkError ?? new Error("PDF unavailable");
      const bytes = await loadMusicAsset(resolvedPdfRef);
      return {
        src: "",
        bytes,
        initialPage: 1,
        source: "canonical" as const,
        sourceVersion: resolvedPdfRef.sha256,
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
    void warmHymnPdfMeta(item).catch(() => undefined);
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
            pdfAsset.bytes ?? pdfAsset.src,
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
    } catch (error) {
      if (controller.signal.aborted || run !== chordRun.current) return;
      const unavailable = error instanceof ChordNotAvailableError;
      setChordStatus(unavailable ? "unavailable" : "error");
      show(
        unavailable
          ? translate(locale, "kidung.chordUnavailable")
          : `${translate(locale, "kidung.chordUnavailable")}; ${translate(locale, "kidung.connectRetry")}`,
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
      const nextUrl =
        asset.src ||
        (asset.bytes
          ? URL.createObjectURL(
              new Blob([asset.bytes.slice().buffer as ArrayBuffer], {
                type: "application/pdf",
              }),
            )
          : "");
      if (run !== pdfRun.current) {
        if (nextUrl.startsWith("blob:")) URL.revokeObjectURL(nextUrl);
        return;
      }
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
    const next = new URLSearchParams(searchParams);
    next.set("mode", mode);
    navigate({ search: next.toString() }, { replace: true });
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
    const songMetaPromise = warmHymnPdfMeta(item);
    try {
      const songMeta = getHymnPdfMeta(item.id);
      const midiDefaults = resolveHymnMidiDefaults(
        songMeta,
        readNaturalChordPreference(),
      );
      const targetTranspose = userSetTransposeRef.current
        ? transposeRef.current
        : midiPlayer.hasTransposePreference()
          ? midiPlayer.settingsSnapshot().transpose
          : midiDefaults.transpose;
      const preloaded = await midiPlayer.hasPreloaded(
        ref.sha256,
        targetTranspose,
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
      const loadedIntoPlayer = await midiPlayer.load(
        item.id,
        item.title,
        loaded.midi,
        {
          rawMidi: bytes,
          sourceHash: ref.sha256,
          midiUrl: rawUrl,
          tempo: midiDefaults.tempo,
          transpose: targetTranspose,
        },
      );
      if (midiLoadGeneration.current !== thisGeneration) return;
      if (!loadedIntoPlayer) return;
      if (!songMeta) {
        void songMetaPromise.then((resolvedMeta) => {
          if (midiLoadGeneration.current !== thisGeneration) return;
          if (resolvedMeta.tempo !== undefined) {
            void midiPlayer
              .setTempo(resolvedMeta.tempo, { userOverride: false })
              .catch(() => undefined);
          }
          const resolvedTranspose = resolveHymnMidiDefaults(
            resolvedMeta,
            readNaturalChordPreference(),
          ).transpose;
          if (
            resolvedMeta.keySemitone !== undefined &&
            resolvedMeta.keySemitone !== null
          ) {
            setSourceKeyIndex(resolvedMeta.keySemitone);
            keyInitialized.current = true;
          }
          if (!userSetTransposeRef.current) {
            transposeRef.current = resolvedTranspose;
            setTranspose(resolvedTranspose);
            void midiPlayer
              .setTranspose(resolvedTranspose, { userOverride: false })
              .catch(() => undefined);
          }
          const sourceKey = resolvedMeta.keySemitone ?? sourceKeyIndex;
          setKeyIndex(
            (((sourceKey +
              (userSetTransposeRef.current
                ? transposeRef.current
                : resolvedTranspose)) %
              12) +
              12) %
              12,
          );
        });
      }
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
  const toggleMidiPlayer = async () => {
    if (midiPlayerEnabled) {
      ++midiLoadGeneration.current;
      isMidiSwitchingRef.current = false;
      (window as unknown as { isMidiSwitching?: boolean }).isMidiSwitching =
        false;
      autoplayRequestRef.current = false;
      setMidiStatus("idle");
      setMidiDockOpen(false);
      await midiPlayer.close();
      return;
    }
    await loadMidi();
  };
  const renderedKey = chordKeyName(keyIndex, accidental);
  const updateTypography = (patch: Partial<HymnTypography>) => {
    setTypography((current) =>
      writeHymnTypography(item.id, { ...current, ...patch }),
    );
  };
  const updateTranspose = (next: number) => {
    const bounded = Math.max(-11, Math.min(11, next));
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
        {/* gyschordweb two-mode presentation: text and PDF are equal citizens
            switched straight from the header, persisted per hymn. */}
        {viewerMode === "pdf" && (
          <div
            className="hymn-mode-toggle"
            role="tablist"
            aria-label={translate(locale, "kidung.viewMode")}
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewerMode !== "pdf"}
              className={`hymn-mode-button${viewerMode !== "pdf" ? " is-active" : ""}`}
              onClick={() => selectViewerMode("lyrics")}
            >
              <Icon name="book" size={16} />
              <span>{translate(locale, "kidung.text")}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={viewerMode === "pdf"}
              className={`hymn-mode-button${viewerMode === "pdf" ? " is-active" : ""}`}
              disabled={!item.pdfPath && !item.assetCode}
              onClick={() => selectViewerMode("pdf")}
            >
              <Icon name="file" size={16} />
              <span>PDF</span>
            </button>
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
                title={
                  chordsVisible
                    ? translate(locale, "kidung.hideChord")
                    : translate(locale, "kidung.showChord")
                }
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
            {!item.assetCode && (
              <button
                type="button"
                className="primary-button hymn-action hymn-action-primary hymn-midi-toggle"
                onClick={() => void toggleMidiPlayer()}
                aria-pressed={midiPlayerEnabled}
                aria-controls="persistent-media-player"
                title={translate(
                  locale,
                  midiPlayerEnabled ? "kidung.closeMidi" : "kidung.openMidi",
                )}
                aria-label={translate(
                  locale,
                  midiPlayerEnabled ? "kidung.closeMidi" : "kidung.openMidi",
                )}
              >
                <span className="hymn-action-icon" aria-hidden="true">
                  <Icon name="play" size={17} />
                </span>
                <span className="hymn-action-label">
                  {translate(
                    locale,
                    midiPlayerEnabled ? "kidung.closeMidi" : "kidung.openMidi",
                  )}
                </span>
              </button>
            )}
          </div>

          {viewerMode !== "pdf" && (
            <button
              type="button"
              className="hymn-partitur-toggle"
              disabled={!item.pdfPath && !item.assetCode}
              aria-label={translate(locale, "kidung.score")}
              title={translate(locale, "kidung.score")}
              onClick={() => selectViewerMode("pdf")}
            >
              <Icon name="file" size={18} />
            </button>
          )}
          <details className="hymn-more-actions" name="hymn-text-toolbar-menu">
            <summary
              className="hymn-more-actions-summary"
              aria-label={translate(locale, "kidung.options")}
              title={translate(locale, "kidung.options")}
            >
              <Icon name="more" size={18} />
              <span className="sr-only">
                {translate(locale, "kidung.options")}
              </span>
            </summary>
            <div className="hymn-more-actions-panel">
              <div className="hymn-segmented-toolbar">
                {viewerMode !== "pdf" && (
                  <div
                    className="hymn-scope-pill-group"
                    role="group"
                    aria-label={translate(locale, "kidung.verseScope")}
                  >
                    <button
                      type="button"
                      className={`hymn-scope-pill-btn${viewScope === "all" ? " is-active" : ""}`}
                      onClick={() => updateViewScope("all")}
                      title={translate(locale, "kidung.showAllVerses")}
                      aria-pressed={viewScope === "all"}
                    >
                      {translate(locale, "kidung.allVerses")}
                    </button>
                    <button
                      type="button"
                      className={`hymn-scope-pill-btn${viewScope === "verse" ? " is-active" : ""}`}
                      onClick={() => updateViewScope("verse")}
                      title={translate(locale, "kidung.showVerseByVerse")}
                      aria-pressed={viewScope === "verse"}
                    >
                      {translate(locale, "kidung.verseLabel", {
                        count: safeVerseIndex + 1,
                      })}
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
                        ? translate(locale, "kidung.autoScrollStop")
                        : translate(locale, "kidung.autoScrollStart")
                    }
                    aria-label={
                      autoScrollActive
                        ? translate(locale, "kidung.autoScrollStop")
                        : translate(locale, "kidung.autoScrollStart")
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
                        ? `Gulir ${autoScrollSpeed}×`
                        : translate(locale, "kidung.autoScroll")}
                    </span>
                  </button>
                  {autoScrollActive && (
                    <select
                      className="hymn-autoscroll-speed-select"
                      value={autoScrollSpeed}
                      onChange={(e) =>
                        setAutoScrollSpeed(Number(e.target.value))
                      }
                      aria-label={translate(locale, "kidung.autoScrollSpeed")}
                    >
                      <option value={1}>1×</option>
                      <option value={2}>2×</option>
                      <option value={3}>3×</option>
                      <option value={4}>4×</option>
                      <option value={5}>5×</option>
                    </select>
                  )}
                </div>
              </div>
              <button
                type="button"
                className="quiet-button hymn-action hymn-fullscreen-action"
                onClick={(event) => {
                  setLyricsPanelOpen(true);
                  event.currentTarget
                    .closest("details")
                    ?.removeAttribute("open");
                }}
                aria-label={translate(locale, "kidung.fullscreenLyrics")}
              >
                <span className="hymn-action-icon" aria-hidden="true">
                  <Icon name="menuBook" size={17} />
                </span>
                <span className="hymn-action-label">
                  {translate(locale, "kidung.fullscreenLyrics")}
                </span>
              </button>
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
              {!item.assetCode && (
                <button
                  type="button"
                  className="quiet-button hymn-action"
                  onClick={() => {
                    const added = addSongToActivePlaylist(item.id);
                    show(
                      added
                        ? translate(locale, "kidung.savedToActivePlaylist")
                        : translate(locale, "kidung.activePlaylistMissing"),
                    );
                  }}
                >
                  <span className="hymn-action-icon" aria-hidden="true">
                    <Icon name="bookmark" size={17} />
                  </span>
                  <span className="hymn-action-label">
                    {translate(locale, "kidung.saveToPlaylist")}
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
                          id: `KR-${numberLabel(item.number, item.id)}`,
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
              <details
                className="hymn-reader-settings"
                name="hymn-reader-settings"
              >
                <summary
                  className="hymn-reader-settings-summary"
                  aria-label={translate(locale, "kidung.readerSettings")}
                  title={translate(locale, "kidung.readerSettings")}
                >
                  <span className="reader-aa-label" aria-hidden="true">
                    Aa
                  </span>
                  <span className="reader-settings-copy">
                    {translate(locale, "kidung.readerSettings")}
                  </span>
                </summary>
                <div className="song-controls">
                  <details
                    className="reader-settings-group hymn-reading-settings"
                    open
                  >
                    <summary>{translate(locale, "kidung.textSpacing")}</summary>
                    <div className="reader-settings-group-body">
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
                                fontSize: fitFontSize - 1,
                              }),
                            )
                          }
                          onPointerUp={holdStop}
                          onPointerLeave={holdStop}
                          onPointerCancel={holdStop}
                          onClick={tapStep(() =>
                            updateTypography({
                              fontSize: fitFontSize - 1,
                            }),
                          )}
                          disabled={fitFontSize <= MIN_HYMN_FONT_SIZE}
                          aria-label={translate(locale, "kidung.decreaseText")}
                        >
                          A−
                        </button>
                        <output aria-live="polite">
                          {Math.round(fitFontSize)} px
                        </output>
                        <button
                          type="button"
                          onPointerDown={() =>
                            holdStart(() =>
                              updateTypography({
                                fontSize: fitFontSize + 1,
                              }),
                            )
                          }
                          onPointerUp={holdStop}
                          onPointerLeave={holdStop}
                          onPointerCancel={holdStop}
                          onClick={tapStep(() =>
                            updateTypography({
                              fontSize: fitFontSize + 1,
                            }),
                          )}
                          disabled={fitFontSize >= MAX_HYMN_FONT_SIZE}
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
                          onClick={tapStep(() =>
                            updateTypography({
                              lineHeight: typography.lineHeight - 0.1,
                            }),
                          )}
                          aria-label={translate(
                            locale,
                            "kidung.decreaseSpacing",
                          )}
                        >
                          − Spasi
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
                          onClick={tapStep(() =>
                            updateTypography({
                              lineHeight: typography.lineHeight + 0.1,
                            }),
                          )}
                          aria-label={translate(
                            locale,
                            "kidung.increaseSpacing",
                          )}
                        >
                          + Spasi
                        </button>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            updateTypography(DEFAULT_HYMN_TYPOGRAPHY)
                          }
                        >
                          {translate(locale, "kidung.resetText")}
                        </button>
                      </div>
                    </div>
                  </details>
                  <details className="reader-settings-group hymn-music-settings">
                    <summary>{translate(locale, "kidung.musicChord")}</summary>
                    <div className="reader-settings-group-body">
                      {midiAvailable && (
                        <div className="hymn-midi-reader-controls">
                          <output className="hymn-soundfont-active">
                            <span>
                              {translate(locale, "kidung.activeSoundfont")}
                            </span>
                            <strong>
                              {midiState.soundfont ??
                                (soundfontInstalled
                                  ? "GeneralUser-GS"
                                  : "TimGM6mb")}
                            </strong>
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
                              <HymnMidiProgress
                                locale={locale}
                                switching={isMidiSwitchingRef.current}
                              />
                            ) : null
                          ) : null}
                          <label className="hymn-instrument-select">
                            <span>
                              {translate(locale, "kidung.instrument")}
                            </span>
                            <select
                              aria-label={translate(
                                locale,
                                "kidung.instrument",
                              )}
                              value={midiSettings.instrument}
                              onChange={(event) =>
                                void midiPlayer
                                  .setInstrument(Number(event.target.value))
                                  .catch(() => undefined)
                              }
                            >
                              <option value={-1}>
                                {midiInstrumentLabel(-1)}
                              </option>
                              {GM_INSTRUMENTS.map((name, program) => (
                                <option key={program} value={program}>
                                  {String(program + 1).padStart(3, "0")} ·{" "}
                                  {name}
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
                              onClick={tapStep(
                                () =>
                                  void midiPlayer.setTempo(
                                    midiSettings.tempo - 2,
                                  ),
                              )}
                              aria-label={translate(locale, "kidung.tempoDown")}
                            >
                              −
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
                              aria-label={translate(locale, "media.tempoInput")}
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
                              onClick={tapStep(
                                () =>
                                  void midiPlayer.setTempo(
                                    midiSettings.tempo + 2,
                                  ),
                              )}
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
                              {translate(locale, "media.volumeShort")}
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
                              aria-label={translate(locale, "media.volumeMidi")}
                            />
                            <button
                              type="button"
                              onClick={() =>
                                void midiPlayer
                                  .setMuted(!midiState.muted)
                                  .catch(() => undefined)
                              }
                              aria-label={translate(
                                locale,
                                midiState.muted
                                  ? "media.unmuteMidi"
                                  : "media.muteMidi",
                              )}
                              style={{ fontSize: "0.8rem" }}
                            >
                              <Icon
                                name={midiState.muted ? "volumeOff" : "volume"}
                                size={16}
                              />
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
                          {translate(locale, "kidung.displayedKey", {
                            key: renderedKey,
                          })}
                          {capo > 0
                            ? ` (${translate(locale, "kidung.shapeKey", {
                                key: chordKeyName(
                                  (((sourceKeyIndex + transpose - capo) % 12) +
                                    12) %
                                    12,
                                  accidental,
                                ),
                              })})`
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
                            onClick={tapStep(() =>
                              updateTranspose(transpose - 1),
                            )}
                            aria-label={translate(
                              locale,
                              "kidung.transposeDown",
                            )}
                          >
                            −
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
                            onClick={tapStep(() =>
                              updateTranspose(transpose + 1),
                            )}
                            aria-label={translate(locale, "kidung.transposeUp")}
                          >
                            +
                          </button>
                          {transpose !== 0 && (
                            <button
                              type="button"
                              className="transpose-reset-btn"
                              onClick={() => updateTranspose(0)}
                              title={translate(locale, "kidung.resetTranspose")}
                            >
                              {translate(locale, "kidung.resetTranspose")}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="capo-control">
                        <span>
                          {translate(locale, "kidung.capo", {
                            value:
                              capo === 0
                                ? translate(locale, "kidung.noCapo")
                                : translate(locale, "kidung.fret", {
                                    count: capo,
                                  }),
                          })}
                        </span>
                        <div className="capo-btn-group">
                          <button
                            type="button"
                            onPointerDown={() =>
                              holdStart(() =>
                                setCapo((c) => Math.max(0, c - 1)),
                              )
                            }
                            onPointerUp={holdStop}
                            onPointerLeave={holdStop}
                            onPointerCancel={holdStop}
                            onClick={tapStep(() =>
                              setCapo((c) => Math.max(0, c - 1)),
                            )}
                            disabled={capo <= 0}
                            aria-label={translate(locale, "kidung.capoDown")}
                          >
                            −
                          </button>
                          <strong>{capo === 0 ? "0" : capo}</strong>
                          <button
                            type="button"
                            onPointerDown={() =>
                              holdStart(() =>
                                setCapo((c) => Math.min(11, c + 1)),
                              )
                            }
                            onPointerUp={holdStop}
                            onPointerLeave={holdStop}
                            onPointerCancel={holdStop}
                            onClick={tapStep(() =>
                              setCapo((c) => Math.min(11, c + 1)),
                            )}
                            disabled={capo >= 11}
                            aria-label={translate(locale, "kidung.capoUp")}
                          >
                            +
                          </button>
                          {capo > 0 && (
                            <button
                              type="button"
                              className="transpose-reset-btn"
                              onClick={() => setCapo(0)}
                              title={translate(locale, "kidung.resetCapo")}
                            >
                              {translate(locale, "kidung.resetCapo")}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </details>
                </div>
              </details>
            </div>
          </details>
        </div>
      </section>
      <section className="hymn-detail-surface">
        {viewerMode === "pdf" && (
          <div className="gys-pdf-overlay">
            <div
              className={`hymn-pdf-viewer-chrome${
                midiAvailable || !item.assetCode ? "" : " is-no-music"
              }`}
              role="toolbar"
              aria-label={translate(locale, "kidung.pdfNavigation")}
            >
              <button
                type="button"
                className="viewer-chrome-button"
                onClick={() => navigate("/kidung")}
                aria-label={translate(locale, "kidung.back")}
              >
                <span aria-hidden="true">
                  <Icon name="chevronLeft" size={18} />
                </span>
                <span className="viewer-chrome-copy">
                  {translate(locale, "kidung.songs")}
                </span>
              </button>
              <button
                type="button"
                className="viewer-chrome-button hymn-pdf-song-nav"
                onClick={() => goToNeighbor(prev)}
                disabled={!prev}
                aria-label={translate(locale, "kidung.previous")}
                title={translate(locale, "kidung.previous")}
              >
                <Icon name="skipPrevious" size={18} />
              </button>
              <div
                className="hymn-pdf-viewer-title"
                id="pdf-viewer-title-wrapper"
                ref={overlayTitleRef}
                onClick={handleTitleTap}
                title={translate(locale, "kidung.editChordHint")}
              >
                <strong id="pdf-viewer-title">{item.title}</strong>
                <small id="pdf-viewer-number">
                  No. {numberLabel(item.number, item.id)}
                </small>
              </div>
              <button
                type="button"
                className="viewer-chrome-button hymn-pdf-song-nav"
                onClick={() => goToNeighbor(next)}
                disabled={!next}
                aria-label={translate(locale, "kidung.next")}
                title={translate(locale, "kidung.next")}
              >
                <Icon name="skipNext" size={18} />
              </button>
              {(midiAvailable || !item.assetCode) && (
                <details
                  className="pdf-music-menu"
                  name="hymn-pdf-toolbar-menu"
                  onToggle={(event) => {
                    if (event.currentTarget.open) setNotice("");
                  }}
                >
                  <summary
                    className="viewer-chrome-button pdf-music-summary"
                    aria-label={translate(locale, "kidung.musicOptions")}
                    title={translate(locale, "kidung.musicOptions")}
                  >
                    <span aria-hidden="true">
                      <Icon name="music" size={18} />
                    </span>
                    <span className="viewer-chrome-copy">
                      {!item.assetCode && chordsVisible
                        ? `${renderedKey}${
                            transpose === 0
                              ? ""
                              : ` · ${transpose > 0 ? `+${transpose}` : transpose}`
                          }`
                        : translate(locale, "kidung.music")}
                    </span>
                  </summary>
                  <div className="pdf-music-menu-panel">
                    {midiAvailable && (
                      <button
                        type="button"
                        className="quiet-button pdf-music-action"
                        aria-expanded={midiPlayerEnabled}
                        aria-pressed={midiPlayerEnabled}
                        onClick={() => {
                          const opening = !midiPlayerEnabled;
                          void toggleMidiPlayer().then(() =>
                            setMidiDockOpen(
                              opening && Boolean(midiPlayer.snapshot().songId),
                            ),
                          );
                        }}
                      >
                        <Icon name="music" size={17} />
                        <span>
                          {translate(
                            locale,
                            midiPlayerEnabled
                              ? "kidung.closeMidi"
                              : "kidung.openMidi",
                          )}
                        </span>
                      </button>
                    )}
                    {!item.assetCode && (
                      <button
                        type="button"
                        className="quiet-button pdf-music-action"
                        onClick={toggleChords}
                        disabled={chordStatus === "loading"}
                        aria-pressed={chordsVisible}
                      >
                        <Icon name="music" size={17} />
                        <span>
                          {chordStatus === "loading"
                            ? translate(locale, "kidung.loadingChord")
                            : chordsVisible
                              ? translate(locale, "kidung.hideChord")
                              : translate(locale, "kidung.showChord")}
                        </span>
                      </button>
                    )}
                    {!item.assetCode && (
                      <div
                        className="pdf-transpose-inline"
                        role="group"
                        aria-label={translate(locale, "kidung.transposePdf")}
                      >
                        <div className="pdf-key-control">
                          <button
                            type="button"
                            className="viewer-chrome-button pdf-key-btn"
                            onClick={() => setPdfKeyMenuOpen((open) => !open)}
                            aria-expanded={pdfKeyMenuOpen}
                            aria-haspopup="listbox"
                            aria-label={translate(locale, "kidung.key")}
                            title={translate(locale, "kidung.key")}
                          >
                            {chordKeyName(keyIndex, accidental)}
                          </button>
                          {pdfKeyMenuOpen && (
                            <div
                              className="pdf-key-dropdown"
                              role="listbox"
                              aria-label={translate(locale, "kidung.key")}
                            >
                              {Array.from({ length: 12 }, (_, value) => (
                                <button
                                  key={value}
                                  type="button"
                                  role="option"
                                  aria-selected={value === keyIndex}
                                  className={
                                    value === keyIndex
                                      ? "is-selected"
                                      : undefined
                                  }
                                  onClick={() => {
                                    setKeyIndex(value);
                                    updateTranspose(
                                      transposeBetweenKeys(
                                        sourceKeyIndex,
                                        value,
                                      ),
                                    );
                                    setPdfKeyMenuOpen(false);
                                  }}
                                >
                                  {chordKeyName(value, accidental)}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <button
                          type="button"
                          className="viewer-chrome-button pdf-accidental-btn"
                          onClick={() =>
                            setAccidental((current) =>
                              current === "sharp" ? "flat" : "sharp",
                            )
                          }
                          aria-pressed={accidental === "flat"}
                          aria-label={translate(locale, "kidung.notation")}
                          title={translate(
                            locale,
                            accidental === "sharp"
                              ? "kidung.sharp"
                              : "kidung.flat",
                          )}
                        >
                          {accidental === "sharp" ? "♯" : "♭"}
                        </button>
                        <div className="pdf-transpose-btns">
                          <button
                            type="button"
                            className="viewer-chrome-button"
                            onClick={() => updateTranspose(transpose - 1)}
                            aria-label={translate(
                              locale,
                              "kidung.transposeDown",
                            )}
                          >
                            −
                          </button>
                          <strong>
                            {transpose > 0 ? `+${transpose}` : transpose}
                          </strong>
                          <button
                            type="button"
                            className="viewer-chrome-button"
                            onClick={() => updateTranspose(transpose + 1)}
                            aria-label={translate(locale, "kidung.transposeUp")}
                          >
                            +
                          </button>
                          {transpose !== 0 && (
                            <button
                              type="button"
                              className="viewer-chrome-button pdf-transpose-reset"
                              onClick={() => updateTranspose(0)}
                              title={translate(locale, "kidung.resetTranspose")}
                            >
                              {translate(locale, "kidung.resetTranspose")}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </details>
              )}
              {midiAvailable && midiDockOpen && (
                <div
                  className="hymn-midi-dock pdf-midi-dock-context"
                  role="group"
                  aria-label={translate(locale, "kidung.midiPlayer")}
                >
                  <MidiControlsPanel locale={locale} />
                </div>
              )}
              {chordEditorEnabled && (
                <div
                  className="chord-editor-toolbar"
                  role="toolbar"
                  aria-label={translate(locale, "kidung.chordEditor")}
                >
                  <strong className="chord-editor-label">
                    {translate(locale, "kidung.chordEditor")}
                  </strong>
                  <button
                    type="button"
                    className="viewer-chrome-button"
                    onClick={downloadEditorChords}
                  >
                    <span className="viewer-chrome-copy">
                      {translate(locale, "kidung.save")}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="viewer-chrome-button"
                    onClick={() => chordFileInput.current?.click()}
                  >
                    <span className="viewer-chrome-copy">
                      {translate(locale, "kidung.import")}
                    </span>
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
            {pdfStatus === "loading" && (
              <div className="loading-panel" role="status">
                <LoadingProgress
                  label={translate(locale, "kidung.pdfOpening")}
                />
              </div>
            )}
            {pdfStatus === "error" && (
              <div className="error-panel" role="alert">
                <strong>{translate(locale, "kidung.pdfFailed")}</strong>
                <span>{translate(locale, "kidung.pdfRetry")}</span>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => void loadPdf()}
                >
                  {translate(locale, "kidung.retry")}
                </button>
              </div>
            )}
            {pdfStatus === "ready" && (
              <Suspense
                fallback={
                  <div className="loading-panel">
                    <LoadingProgress
                      label={translate(locale, "kidung.pdfOpening")}
                    />
                  </div>
                }
              >
                <PdfReader
                  src={pdfUrl ?? ""}
                  {...(pdfBytes ? { data: pdfBytes } : {})}
                  initialPage={pdfInitialPage}
                  locale={locale}
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
                      const chordLine = vChordLines[index];
                      return (
                        <p key={`${index}-${line}`}>
                          {chordLine && chordLine.chords.length > 0 ? (
                            <ChordCapability
                              lines={[chordLine]}
                              active={chordsVisible}
                              transpose={transpose - capo}
                              accidental={accidental}
                              locale={locale}
                            />
                          ) : (
                            line || "\u00A0"
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
                const chordLine = chordLines[index];
                return (
                  <p key={`${index}-${line}`}>
                    {chordLine && chordLine.chords.length > 0 ? (
                      <ChordCapability
                        lines={[chordLine]}
                        active={chordsVisible}
                        transpose={transpose - capo}
                        accidental={accidental}
                        locale={locale}
                      />
                    ) : (
                      line || "\u00A0"
                    )}
                  </p>
                );
              })}
            </article>
          ))}
        {chordsVisible && chordStatus === "loading" && (
          <div className="loading-panel" role="status">
            <LoadingProgress
              label={translate(locale, "kidung.chordVerifying")}
            />
          </div>
        )}
        {chordsVisible &&
          (chordStatus === "error" || chordStatus === "unavailable") && (
            <div
              className="error-panel"
              role={chordStatus === "unavailable" ? "status" : "alert"}
            >
              <strong>{translate(locale, "kidung.chordUnavailable")}</strong>
              {chordStatus === "error" && (
                <>
                  <span>{translate(locale, "kidung.connectRetry")}</span>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void loadChord()}
                  >
                    {translate(locale, "kidung.retry")}
                  </button>
                </>
              )}
            </div>
          )}
        {viewerMode !== "pdf" && (
          <nav
            className={`hymn-text-footer${viewScope === "all" ? " is-all-verses" : ""}`}
            aria-label={translate(locale, "kidung.verseNavigation")}
          >
            <button
              type="button"
              disabled={!prev}
              onClick={() => goToNeighbor(prev)}
              aria-label={translate(locale, "kidung.previous")}
              title={translate(locale, "kidung.previous")}
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
                  title={translate(locale, "kidung.previousVerse")}
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
                  title={translate(locale, "kidung.nextVerse")}
                >
                  <Icon name="chevronRight" size={19} />
                </button>
              </>
            ) : (
              <span className="hymn-all-verses-summary">
                {translate(locale, "kidung.allVerseCount", {
                  count: verses.length,
                })}
              </span>
            )}
            <button
              type="button"
              disabled={!next}
              onClick={() => goToNeighbor(next)}
              aria-label={translate(locale, "kidung.next")}
              title={translate(locale, "kidung.next")}
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
      {lyricsPanelOpen && (
        <LyricsPanel
          locale={locale}
          item={item}
          verses={verses}
          getChordLinesForVerse={(verseIdx) =>
            matchChordLinesToLyrics(
              (verses[verseIdx] ?? "").split("\n"),
              chordDocument,
              chordLayout,
              verseIdx,
            )
          }
          initialVerseIndex={safeVerseIndex}
          onNavigateSong={(delta) => changeVerse(delta)}
          onClose={() => setLyricsPanelOpen(false)}
        />
      )}
    </div>
  );
}
