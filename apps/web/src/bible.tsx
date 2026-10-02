import { installReadingZoom } from "./reading-zoom.js";
import { BibleNotesPopup } from "./bible-notes-popup.js";
import {
  type BibleNotes,
  BOOK_KEY,
  CHAPTER_KEY,
  BOOKMARKS_KEY,
  NOTES_KEY,
  HIGHLIGHTS_KEY,
  HIGHLIGHT_PALETTE_KEY,
  SEARCH_HISTORY_KEY,
  VERSION_KEY,
  MAX_CUSTOM_HIGHLIGHT_COLORS,
  readSavedNumber,
  readSavedVersion,
  readStringSet,
  readBibleNotes,
  readBibleHighlights,
  readCustomHighlightColors,
  makeBibleNoteId,
  readSearchHistory,
} from "./bible-reader-storage.js";
import { useReadinessMarker } from "./readiness.js";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  SpeechEnginePreferenceSchema,
  type BibleBook,
  type BibleCrossReference,
  type BibleReaderPack,
} from "@gys/contracts";
import { sanitizeBibleText, type BibleVerse } from "@gys/domain";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import {
  bibleBookNames,
  parseBibleDeepLink,
  resolveBibleDeepLink,
} from "./global-bible-search.js";
import { Select } from "./select.js";
import { setBibleActivity } from "./history.js";
import { speechPlayer } from "./speech-player.js";
import { bibleSpeechLanguage } from "./bible-language.js";
import { BibleSearchClient } from "./bible-search.js";
import {
  calculateProportionalScroll,
  calculateVerseAnchorScroll,
  useBibleSplitController,
} from "./bible-split.js";
import { recordDiagnostic } from "./diagnostics.js";
import {
  BIBLE_FONT_SIZE_MAX,
  BIBLE_FONT_SIZE_MIN,
  decreaseBibleFontSize,
  increaseBibleFontSize,
  readBibleTypography,
  subscribeBibleTypography,
  writeBibleTypography,
  type BibleTypography,
} from "./bible-typography.js";
import { hapticTick } from "./haptics.js";
import {
  BiblePickerModal,
  BibleQuickNavOverlay,
  scrubBookIndex,
  scrubChapterNumber,
  scrubVerseNumber,
  type QuickNavDragState,
} from "./bible-quick-nav.js";
import {
  getDistributedAssetManager,
  type ManagedDistributedAsset,
} from "./distributed-asset-manager.js";
import { loadBibleReaderPack } from "./bible-distributed.js";
import { loadBundledBiblePack } from "./bible-pack-loader.js";
import { Icon } from "./icons.js";
import { ChapterPane } from "./bible-chapter.js";
import {
  DEFAULT_HIGHLIGHT_COLORS,
  isCustomHighlightColor,
} from "./bible-highlights.js";
import {
  BibleSearchPanel,
  SEARCH_RESULTS_PAGE_SIZE,
} from "./bible-search-panel.js";
import { setBibleHeaderState } from "./bible-header-store.js";

type PackState =
  | { status: "loading" }
  | { status: "ready"; pack: BibleReaderPack }
  | { status: "error"; message: string };

type SelectionToolbarState = {
  text: string;
  verseId?: string;
  left: number;
  top: number;
};

function cleanVerse(verse: BibleVerse): string {
  return sanitizeBibleText(verse.text);
}

function speechVerseId(
  context: { path: string } | undefined,
): string | undefined {
  const marker = "#bible-verse-";
  const hashIndex = context?.path.indexOf(marker) ?? -1;
  if (hashIndex < 0) return undefined;
  const encoded = context?.path.slice(hashIndex + marker.length);
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

function findNextTarget(
  books: readonly BibleBook[],
  book: BibleBook,
  chapter: number,
  delta: number,
): { book: BibleBook; chapter: number } | undefined {
  const index = books.findIndex((candidate) => candidate.id === book.id);
  if (index < 0) return undefined;
  if (delta > 0) {
    if (chapter < book.chapters) return { book, chapter: chapter + 1 };
    const nextBook = books[index + 1];
    return nextBook ? { book: nextBook, chapter: 1 } : undefined;
  }
  if (chapter > 1) return { book, chapter: chapter - 1 };
  const previousBook = books[index - 1];
  return previousBook
    ? { book: previousBook, chapter: previousBook.chapters }
    : undefined;
}

const EMPTY_BOOKMARKS = new Set<string>();
const EMPTY_HIGHLIGHTS: Record<string, string> = {};

export function BiblePage({ locale }: { locale: Locale }) {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [packState, setPackState] = useState<PackState>({ status: "loading" });
  const [selectedVersionCode, setSelectedVersionCode] =
    useState(readSavedVersion);
  const [bibleAssets, setBibleAssets] = useState<ManagedDistributedAsset[]>([]);
  const [assetCatalogReady, setAssetCatalogReady] = useState(false);
  const deepLink = useMemo(
    () => parseBibleDeepLink(searchParams),
    [searchParams],
  );
  const lastAppliedDeepLinkRef = useRef<string | undefined>(undefined);
  const [selectedBook, setSelectedBook] = useState(() =>
    readSavedNumber(BOOK_KEY, 1),
  );
  const [selectedChapter, setSelectedChapter] = useState(() =>
    readSavedNumber(CHAPTER_KEY, 1),
  );
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchBook, setSearchBook] = useState("all");
  const [exactPhrase, setExactPhrase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(false);
  const [searchResults, setSearchResults] = useState<BibleVerse[]>([]);
  const [visibleSearchResultCount, setVisibleSearchResultCount] = useState(
    SEARCH_RESULTS_PAGE_SIZE,
  );
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  useReadinessMarker(
    "gys-bible-search-ready",
    Boolean(searchedQuery) && !searching,
    searchResults,
  );
  const [searchHistory, setSearchHistory] = useState(readSearchHistory);
  const [bookmarks, setBookmarks] = useState<Set<string>>(() =>
    readStringSet(BOOKMARKS_KEY),
  );
  const [notes, setNotes] = useState<BibleNotes>(readBibleNotes);
  const [highlights, setHighlights] =
    useState<Record<string, string>>(readBibleHighlights);
  const [customHighlightColors, setCustomHighlightColors] = useState(
    readCustomHighlightColors,
  );
  const [selectedVerseId, setSelectedVerseId] = useState<string>();
  const [selectedNoteId, setSelectedNoteId] = useState<string>();
  const selectedNoteIdRef = useRef<string | undefined>(undefined);
  selectedNoteIdRef.current = selectedNoteId;
  const [noteDraft, setNoteDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [speechControlsOpen, setSpeechControlsOpen] = useState(
    () => searchParams.get("settings") === "audio",
  );
  const [readerActionsOpen, setReaderActionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<
    SelectionToolbarState | undefined
  >();
  const [secondaryVersionCode, setSecondaryVersionCode] = useState(() => {
    if (typeof window === "undefined") return "b_tb";
    return localStorage.getItem("gys-bible-secondary-version") ?? "b_tb";
  });
  const [secondaryPackState, setSecondaryPackState] = useState<PackState>({
    status: "loading",
  });
  const [secondaryPackAttempt, setSecondaryPackAttempt] = useState(0);
  const [crossRefModal, setCrossRefModal] = useState<
    | {
        pericopeId: string;
        title: string;
        refs: readonly BibleCrossReference[];
      }
    | undefined
  >(undefined);
  const {
    splitView,
    setSplitView,
    splitRatio,
    setSplitRatio,
    splitLayoutRef,
    startSplitDrag,
    syncScroll,
    setSyncScroll,
    toggleSyncScroll,
  } = useBibleSplitController();
  const pageZoomRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (pageZoomRef.current) return installReadingZoom(pageZoomRef.current);
  }, []);
  const primaryScrollRef = useRef<HTMLDivElement | null>(null);
  const secondaryScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef(false);

  const [pickerModalOpen, setPickerModalOpen] = useState(false);
  const pickerTriggerRef = useRef<HTMLElement | null>(null);
  const [notesPopupOpen, setNotesPopupOpen] = useState(false);
  const [packAttempt, setPackAttempt] = useState(0);
  const [quickNavDrag, setQuickNavDrag] = useState<
    QuickNavDragState | undefined
  >(undefined);
  const touchStartX = useRef<number | undefined>(undefined);
  const searchAbortRef = useRef<AbortController | undefined>(undefined);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const quickNavRef = useRef<
    | {
        pointerId: number;
        startX: number;
        startY: number;
        startTime: number;
        hasDragged: boolean;
        levelStartY: number;
        currentY: number;
        activeColumn: "book" | "chapter" | "verse";
        initialBookIndex: number;
        initialChapter: number;
        initialVerse: number;
        currentBookId: number;
        currentChapter: number;
        currentVerse: number;
      }
    | undefined
  >(undefined);
  const suppressQuickNavClickRef = useRef(false);
  const [typography, setTypography] = useState<BibleTypography>(() =>
    readBibleTypography(),
  );
  const typographyRef = useRef(typography);
  typographyRef.current = typography;
  const changeFontSize = useCallback((direction: 1 | -1) => {
    const next =
      direction === 1
        ? increaseBibleFontSize(typographyRef.current)
        : decreaseBibleFontSize(typographyRef.current);
    typographyRef.current = next;
    // Persist from the event handler: React may replay state updaters in dev.
    writeBibleTypography(next);
    setTypography(next);
  }, []);
  const openPickerModal = useCallback((trigger?: HTMLElement | null) => {
    pickerTriggerRef.current =
      trigger ??
      (typeof document !== "undefined" &&
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null);
    setPickerModalOpen(true);
  }, []);
  const closePickerModal = useCallback(() => {
    setPickerModalOpen(false);
    window.requestAnimationFrame(() => {
      const target = pickerTriggerRef.current;
      if (target?.isConnected) target.focus({ preventScroll: true });
    });
  }, []);
  const focusBibleSearch = useCallback(() => {
    setSearchOpen(true);
    window.requestAnimationFrame(() => {
      const input = searchInputRef.current;
      if (!input) return;
      const bounds = input.getBoundingClientRect();
      const topbarBottom =
        document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
      if (bounds.top < topbarBottom || bounds.bottom > window.innerHeight) {
        input.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      input.focus({ preventScroll: true });
    });
  }, []);
  useEffect(
    () => subscribeBibleTypography(() => setTypography(readBibleTypography())),
    [],
  );
  useEffect(() => {
    let active = true;
    const manager = getDistributedAssetManager();
    const refresh = async () => {
      try {
        const statuses = await manager.loadStatuses();
        if (active) {
          setBibleAssets(statuses.filter((asset) => asset.kind === "bible"));
          setAssetCatalogReady(true);
        }
      } catch {
        if (active) setAssetCatalogReady(true);
      }
    };
    void refresh();
    const onAssetsChanged = () => void refresh();
    window.addEventListener("gys-distributed-assets-change", onAssetsChanged);
    return () => {
      active = false;
      window.removeEventListener(
        "gys-distributed-assets-change",
        onAssetsChanged,
      );
    };
  }, []);

  const startQuickNav = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    suppressQuickNavClickRef.current = false;
    const bookId = book?.id ?? selectedBook;
    quickNavRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      hasDragged: false,
      levelStartY: event.clientY,
      currentY: event.clientY,
      activeColumn: "book",
      initialBookIndex: Math.max(
        0,
        books.findIndex((candidate) => candidate.id === bookId),
      ),
      initialChapter: chapter,
      initialVerse: 1,
      currentBookId: bookId,
      currentChapter: chapter,
      currentVerse: 1,
    };
  };

  const quickNavKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (!book) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openPickerModal(event.currentTarget);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setSelectedChapter((value) => Math.max(1, value - 1));
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setSelectedChapter((value) => Math.min(book.chapters, value + 1));
    }
  };

  const syncPaneByVerseAnchor = (
    source: HTMLDivElement,
    target: HTMLDivElement,
  ) => {
    const sourceRows = source.querySelectorAll<HTMLElement>(".verse-row");
    const targetRows = target.querySelectorAll<HTMLElement>(".verse-row");
    const sourceTop = source.getBoundingClientRect().top;
    const sourceIndex = Array.from(sourceRows).findIndex(
      (row) => row.getBoundingClientRect().bottom > sourceTop + 1,
    );
    const targetIndex =
      sourceIndex < 0 || targetRows.length === 0
        ? -1
        : calculateVerseAnchorScroll(
            sourceIndex + 1,
            sourceRows.length,
            targetRows.length,
          ) - 1;
    const sourceRow = sourceRows[sourceIndex];
    const targetRow = targetRows[targetIndex];
    if (!sourceRow || !targetRow) {
      target.scrollTop = calculateProportionalScroll(
        source.scrollTop,
        source.scrollHeight,
        source.clientHeight,
        target.scrollHeight,
        target.clientHeight,
      );
      return;
    }

    const sourceRect = sourceRow.getBoundingClientRect();
    const targetRect = targetRow.getBoundingClientRect();
    const targetTop = target.getBoundingClientRect().top;
    const verseProgress =
      sourceRect.height > 0
        ? Math.max(
            0,
            Math.min(1, (sourceTop - sourceRect.top) / sourceRect.height),
          )
        : 0;
    target.scrollTop +=
      targetRect.top - targetTop + verseProgress * targetRect.height;
  };

  const onPrimaryScroll = () => {
    if (!splitView || !syncScroll || isSyncingRef.current) return;
    const primary = primaryScrollRef.current;
    const secondary = secondaryScrollRef.current;
    if (!primary || !secondary) return;
    isSyncingRef.current = true;
    syncPaneByVerseAnchor(primary, secondary);
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  const onSecondaryScroll = () => {
    if (!splitView || !syncScroll || isSyncingRef.current) return;
    const primary = primaryScrollRef.current;
    const secondary = secondaryScrollRef.current;
    if (!primary || !secondary) return;
    isSyncingRef.current = true;
    syncPaneByVerseAnchor(secondary, primary);
    requestAnimationFrame(() => {
      isSyncingRef.current = false;
    });
  };

  // A cross-space search result can deep-link straight to a verse. The
  // reference is applied only after the offline pack validates it, so an
  // invalid or stale link falls back to the saved reading position instead
  // of leaving the reader on a missing chapter. Re-applying the same
  // reference is a no-op, so revisiting the route does not fight the user's
  // manual navigation.
  useEffect(() => {
    if (!deepLink) return;
    const key = `${location.key}:${deepLink.version ?? ""}:${deepLink.book}:${deepLink.chapter}:${deepLink.verse}`;
    if (lastAppliedDeepLinkRef.current === key) return;
    if (deepLink.version) {
      if (deepLink.version !== "b_tb") {
        if (!assetCatalogReady) return;
        const versionAvailable = bibleAssets.some(
          (asset) =>
            asset.code === deepLink.version &&
            (asset.state === "installed" || asset.state === "update"),
        );
        if (!versionAvailable) return;
      }
      if (selectedVersionCode !== deepLink.version) {
        setPackState({ status: "loading" });
        setSelectedVerseId(undefined);
        setSelectedVersionCode(deepLink.version);
        localStorage.setItem(VERSION_KEY, deepLink.version);
        return;
      }
    }
    if (packState.status !== "ready") return;
    const resolved = resolveBibleDeepLink(packState.pack, deepLink);
    if (!resolved) return;
    lastAppliedDeepLinkRef.current = key;
    setSelectedBook(resolved.bookId);
    setSelectedChapter(resolved.chapter);
    setSelectedVerseId(
      `${resolved.bookId}:${resolved.chapter}:${resolved.verse}`,
    );
  }, [
    assetCatalogReady,
    bibleAssets,
    deepLink,
    location.key,
    packState,
    selectedVersionCode,
  ]);

  useEffect(() => {
    const controller = new AbortController();
    setPackState({ status: "loading" });
    const request =
      selectedVersionCode === "b_tb"
        ? loadBundledBiblePack()
        : loadBibleReaderPack(
            selectedVersionCode,
            getDistributedAssetManager().getStore(),
          );
    void request
      .then((pack) => {
        if (!controller.signal.aborted) setPackState({ status: "ready", pack });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setPackState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load the offline TB reader",
          });
      });
    return () => controller.abort();
  }, [packAttempt, selectedVersionCode]);

  useEffect(() => {
    localStorage.setItem("gys-bible-secondary-version", secondaryVersionCode);
  }, [secondaryVersionCode]);

  useEffect(() => {
    if (!splitView) return;
    if (
      secondaryVersionCode === selectedVersionCode &&
      packState.status === "ready"
    ) {
      setSecondaryPackState({ status: "ready", pack: packState.pack });
      return;
    }
    const controller = new AbortController();
    setSecondaryPackState({ status: "loading" });
    const request =
      secondaryVersionCode === "b_tb"
        ? loadBundledBiblePack()
        : loadBibleReaderPack(
            secondaryVersionCode,
            getDistributedAssetManager().getStore(),
          );
    void request
      .then((pack) => {
        // eslint-disable-next-line no-console
        console.log(
          `[bible secondary] loaded pack ${pack.translation} pericopes ${(pack as unknown as { pericopes?: unknown[] }).pericopes?.length ?? 0}`,
        );
        if (!controller.signal.aborted)
          setSecondaryPackState({ status: "ready", pack });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setSecondaryPackState({
            status: "error",
            message:
              error instanceof Error
                ? error.message
                : "Unable to load secondary pack",
          });
      });
    return () => controller.abort();
  }, [
    splitView,
    secondaryVersionCode,
    selectedVersionCode,
    packState,
    packAttempt,
    secondaryPackAttempt,
  ]);

  const searchClient = useMemo(
    () =>
      packState.status === "ready"
        ? new BibleSearchClient(
            packState.pack.verses,
            undefined,
            bibleBookNames(packState.pack),
            true,
          )
        : undefined,
    [packState],
  );
  useEffect(
    () => () => {
      searchAbortRef.current?.abort();
      searchClient?.dispose();
    },
    [searchClient],
  );
  const books = packState.status === "ready" ? packState.pack.books : [];
  const bibleVersionOptions = [
    { value: "b_tb", label: "Terjemahan Baru", shortLabel: "TB" },
    ...bibleAssets
      .filter(
        (asset) =>
          asset.code !== "b_tb" &&
          (asset.state === "installed" || asset.state === "update"),
      )
      .map((asset) => {
        const raw = asset.code.replace(/^b_/, "").toUpperCase();
        const short =
          raw === "TB" || asset.title.toLowerCase().includes("terjemahan baru")
            ? "TB"
            : raw === "KJV" || asset.title.toLowerCase().includes("king james")
              ? "KJV"
              : raw === "CUV" ||
                  asset.title.toLowerCase().includes("chinese union")
                ? "CUV"
                : raw === "AYT"
                  ? "AYT"
                  : raw === "BBE"
                    ? "BBE"
                    : raw.length <= 5
                      ? raw
                      : asset.title.slice(0, 4).toUpperCase();
        return { value: asset.code, label: asset.title, shortLabel: short };
      }),
  ];
  useEffect(() => {
    if (!assetCatalogReady || selectedVersionCode === "b_tb") return;
    if (
      bibleVersionOptions.some((option) => option.value === selectedVersionCode)
    )
      return;
    setSelectedVersionCode("b_tb");
    localStorage.setItem(VERSION_KEY, "b_tb");
  }, [assetCatalogReady, bibleVersionOptions, selectedVersionCode]);
  const book =
    books.find((candidate) => candidate.id === selectedBook) ?? books[0];
  const chapter = Math.min(selectedChapter, book?.chapters ?? selectedChapter);
  // Each held level advances after two seconds; only releasing on Ayat commits.
  const quickNavLevel = quickNavDrag?.activeColumn;
  const quickNavHeldValue = quickNavDrag
    ? quickNavDrag.activeColumn === "book"
      ? quickNavDrag.bookId
      : quickNavDrag.activeColumn === "chapter"
        ? quickNavDrag.chapter
        : quickNavDrag.verse
    : undefined;
  useEffect(() => {
    if (!quickNavLevel || quickNavLevel === "verse") return;
    if (quickNavDrag?.isOutside) return;
    const timer = window.setTimeout(() => {
      const active = quickNavRef.current;
      if (!active || !active.hasDragged) return;
      if (quickNavDrag?.isOutside) return;
      hapticTick("hold");
      active.levelStartY = active.currentY;
      if (quickNavLevel === "book") {
        active.activeColumn = "chapter";
        active.initialChapter = 1;
        active.currentChapter = 1;
        active.currentVerse = 1;
        setQuickNavDrag((value) =>
          value
            ? {
                ...value,
                activeColumn: "chapter",
                chapter: 1,
                verse: 1,
                isOutside: false,
              }
            : value,
        );
      } else {
        active.activeColumn = "verse";
        active.initialVerse = 1;
        active.currentVerse = 1;
        setQuickNavDrag((value) =>
          value
            ? { ...value, activeColumn: "verse", verse: 1, isOutside: false }
            : value,
        );
      }
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [quickNavHeldValue, quickNavLevel, quickNavDrag?.isOutside]);

  const quickNavValueAtPoint = (clientX: number, clientY: number) => {
    const list = document.querySelector<HTMLElement>(".quick-nav-column-list");
    if (!list) return undefined;
    const bounds = list.getBoundingClientRect();
    if (
      clientX < bounds.left ||
      clientX > bounds.right ||
      clientY < bounds.top ||
      clientY > bounds.bottom
    ) {
      return undefined;
    }
    let closest: { value: number; distance: number } | undefined;
    for (const item of list.querySelectorAll<HTMLElement>(
      "[data-quick-nav-value]",
    )) {
      const rect = item.getBoundingClientRect();
      const distance =
        (clientX - (rect.left + rect.right) / 2) ** 2 +
        (clientY - (rect.top + rect.bottom) / 2) ** 2;
      const value = Number(item.dataset.quickNavValue);
      if (Number.isFinite(value) && (!closest || distance < closest.distance)) {
        closest = { value, distance };
      }
    }
    return closest?.value;
  };

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = quickNavRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;
      active.currentY = event.clientY;

      if (!active.hasDragged && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        active.hasDragged = true;
        const currentBook =
          books.find((candidate) => candidate.id === active.currentBookId) ??
          book;
        setQuickNavDrag({
          activeColumn: "book",
          bookId: active.currentBookId,
          chapter: active.currentChapter,
          verse: 1,
          bookName: currentBook?.name ?? "Alkitab",
          totalChapters: currentBook?.chapters ?? 1,
          totalVerses: 1,
          isOutside: false,
        });
      }

      if (!active.hasDragged) return;

      event.preventDefault();
      const pointedValue = quickNavValueAtPoint(event.clientX, event.clientY);
      const isOutside = pointedValue === undefined;
      if (isOutside) {
        // di luar box aktif → deselect, tidak auto proceed sampai kembali ke dalam
        setQuickNavDrag((prev) =>
          prev && !prev.isOutside ? { ...prev, isOutside: true } : prev,
        );
        return;
      }
      let nextBookId = active.currentBookId;
      let nextChapter = active.currentChapter;
      let nextVerse = active.currentVerse;
      if (active.activeColumn === "book") {
        const index = books.findIndex(
          (candidate) => candidate.id === pointedValue,
        );
        if (index !== -1) {
          nextBookId = books[index]!.id;
          nextChapter = 1;
          nextVerse = 1;
        }
      }
      const currentB =
        books.find((candidate) => candidate.id === nextBookId) ?? book!;
      if (active.activeColumn === "chapter" && currentB) {
        nextChapter = Math.min(currentB.chapters, pointedValue);
        nextVerse = 1;
      }
      const totalVerses =
        packState.status === "ready"
          ? packState.pack.verses.filter(
              (verse) =>
                verse.book === String(nextBookId) &&
                verse.chapter === nextChapter,
            ).length || 1
          : 30;
      if (active.activeColumn === "verse") {
        nextVerse = Math.min(totalVerses, pointedValue);
      }

      if (
        nextBookId !== active.currentBookId ||
        nextChapter !== active.currentChapter ||
        nextVerse !== active.currentVerse
      ) {
        hapticTick("light");
        active.currentBookId = nextBookId;
        active.currentChapter = nextChapter;
        active.currentVerse = nextVerse;
      }

      setQuickNavDrag({
        activeColumn: active.activeColumn,
        bookId: nextBookId,
        chapter: nextChapter,
        verse: nextVerse,
        bookName: currentB?.name ?? "Alkitab",
        totalChapters: currentB?.chapters ?? 1,
        totalVerses,
        isOutside: false,
      });
    };

    const end = (event: PointerEvent) => {
      const active = quickNavRef.current;
      if (!active || active.pointerId !== event.pointerId) return;

      if (active.hasDragged) {
        suppressQuickNavClickRef.current = true;
        setPickerModalOpen(false);
        const targetChapter =
          active.activeColumn === "book" ? 1 : active.currentChapter;
        const targetVerse =
          active.activeColumn === "verse" ? active.currentVerse : 1;
        setSelectedBook(active.currentBookId);
        setSelectedChapter(targetChapter);
        setSelectedVerseId(
          `${active.currentBookId}:${targetChapter}:${targetVerse}`,
        );
        quickNavRef.current = undefined;
        setQuickNavDrag(undefined);
        window.setTimeout(() => {
          suppressQuickNavClickRef.current = false;
        }, 750);
      } else {
        quickNavRef.current = undefined;
        setQuickNavDrag(undefined);
        setPickerModalOpen(true);
      }
    };

    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, [book, books, packState]);

  const chapterVerses = useMemo(() => {
    if (packState.status !== "ready" || !book) return [];
    return packState.pack.verses.filter(
      (verse) => verse.book === String(book.id) && verse.chapter === chapter,
    );
  }, [book, chapter, packState]);
  useReadinessMarker(
    "gys-bible-chapter-ready",
    packState.status === "ready" && chapterVerses.length > 0,
  );
  const nextTarget = useMemo(
    () => (book ? findNextTarget(books, book, chapter, 1) : undefined),
    [books, book, chapter],
  );
  const nextVerses = useMemo(() => {
    if (packState.status !== "ready" || !nextTarget) return [];
    return packState.pack.verses.filter(
      (verse) =>
        verse.book === String(nextTarget.book.id) &&
        verse.chapter === nextTarget.chapter,
    );
  }, [nextTarget, packState]);
  const secondaryChapter = useMemo(() => {
    if (!splitView || secondaryPackState.status !== "ready" || !book)
      return undefined;
    const pack = secondaryPackState.pack;
    const secondaryBook =
      pack.books.find((candidate) => candidate.id === selectedBook) ??
      pack.books.find(
        (candidate) => String(candidate.id) === String(book.id),
      ) ??
      book;
    return {
      book: secondaryBook,
      verses: pack.verses.filter(
        (verse) =>
          verse.book === String(secondaryBook.id) && verse.chapter === chapter,
      ),
    };
  }, [splitView, secondaryPackState, selectedBook, book, chapter]);
  const selectedVerse = selectedVerseId
    ? chapterVerses.find((verse) => verse.id === selectedVerseId)
    : undefined;

  const [exitingVerse, setExitingVerse] = useState(false);
  const exitTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const activeVerseRef = useRef<BibleVerse | undefined>(undefined);

  if (selectedVerse) {
    activeVerseRef.current = selectedVerse;
  }

  const handleCloseSelectedVerse = useCallback(() => {
    setExitingVerse(true);
    if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    exitTimerRef.current = setTimeout(() => {
      setSelectedVerseId(undefined);
      setExitingVerse(false);
      activeVerseRef.current = undefined;
    }, 180);
  }, []);

  useEffect(() => {
    if (selectedVerseId) {
      setExitingVerse(false);
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    }
  }, [selectedVerseId]);

  const activeToolbarVerse =
    selectedVerse ?? (exitingVerse ? activeVerseRef.current : undefined);

  useEffect(() => {
    const onSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim() ?? "";
      if (!selection || selection.isCollapsed || text.length < 2) {
        setSelectionToolbar(undefined);
        return;
      }
      const node = selection.anchorNode;
      const element =
        node?.nodeType === Node.ELEMENT_NODE
          ? (node as Element)
          : node?.parentElement;
      const reader = element?.closest(".bible-reader");
      if (!reader) {
        setSelectionToolbar(undefined);
        return;
      }
      const range = selection.rangeCount ? selection.getRangeAt(0) : undefined;
      const rect = range?.getBoundingClientRect();
      if (!rect) return;
      const verse = element?.closest<HTMLElement>(".verse-row");
      const left = Math.max(8, Math.min(window.innerWidth - 280, rect.left));
      const top = Math.max(8, rect.top - 58);
      setSelectionToolbar({
        text,
        left,
        top,
        ...(verse?.id ? { verseId: verse.id.replace("bible-verse-", "") } : {}),
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, []);
  const speechSnapshot = useSyncExternalStore(
    speechPlayer.subscribe,
    speechPlayer.snapshot,
    speechPlayer.snapshot,
  );
  const speechAvailable =
    typeof window !== "undefined" && speechSnapshot.available;
  // Both Edge and local voices are selectable on "auto"/"edge"; only the
  // explicit "local" engine hides remote voices.
  const availableSpeechVoices = speechSnapshot.voices.filter((voice) =>
    speechSnapshot.engine === "local" ? voice.local : true,
  );
  const bibleLanguageTag = bibleSpeechLanguage(selectedVersionCode);
  const speakingVerseId = useMemo(
    () =>
      speechSnapshot.status === "speaking" || speechSnapshot.status === "paused"
        ? speechVerseId(speechSnapshot.context)
        : undefined,
    [speechSnapshot.context, speechSnapshot.status],
  );
  useEffect(() => {
    setSpeaking(
      speechSnapshot.status === "loading" ||
        speechSnapshot.status === "speaking" ||
        speechSnapshot.status === "paused",
    );
  }, [speechSnapshot.status]);

  useEffect(() => {
    if (!book) return;
    // Keep the chapter within the book's bounds. Do NOT re-write
    // `selectedBook` here: `book` is derived from `selectedBook` at render
    // time, so writing it back would clobber a freshly applied deep-link
    // (e.g. /bible?book=43 opens Yohanes, not the previous Kejadian).
    setSelectedChapter((value) => Math.min(value, book.chapters));
  }, [book]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    localStorage.setItem(BOOK_KEY, String(selectedBook));
    localStorage.setItem(CHAPTER_KEY, String(chapter));
    localStorage.setItem(
      "gys-bible-last-reading",
      JSON.stringify({ book: book?.name, chapter }),
    );
    if (book) setBibleActivity(book.name, chapter);
  }, [book, chapter, selectedBook]);

  useEffect(() => {
    localStorage.setItem(BOOKMARKS_KEY, JSON.stringify([...bookmarks]));
  }, [bookmarks]);
  useEffect(() => {
    localStorage.setItem(NOTES_KEY, JSON.stringify(notes));
  }, [notes]);
  useEffect(() => {
    localStorage.setItem(HIGHLIGHTS_KEY, JSON.stringify(highlights));
  }, [highlights]);
  useEffect(() => {
    localStorage.setItem(
      HIGHLIGHT_PALETTE_KEY,
      JSON.stringify(customHighlightColors),
    );
  }, [customHighlightColors]);
  useEffect(() => {
    if (!selectedVerseId) {
      setSelectedNoteId(undefined);
      setNoteDraft("");
      return;
    }
    const verseNotes = notes[selectedVerseId] ?? [];
    const selectedNote =
      verseNotes.find((note) => note.id === selectedNoteIdRef.current) ??
      verseNotes[0];
    if (selectedNote?.id !== selectedNoteIdRef.current)
      setSelectedNoteId(selectedNote?.id);
    setNoteDraft(selectedNote?.text ?? "");
    window.setTimeout(() => {
      document
        .getElementById(`bible-verse-${selectedVerseId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 0);
  }, [chapterVerses, notes, selectedVerseId]);
  useEffect(() => {
    if (!speakingVerseId || !window.location.pathname.endsWith("/bible"))
      return;
    const frame = window.requestAnimationFrame(() => {
      document
        .getElementById(`bible-verse-${speakingVerseId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [speakingVerseId]);
  const navigateBy = (delta: number) => {
    if (!book) return;
    const target = findNextTarget(books, book, chapter, delta);
    if (!target) return;
    setSelectedBook(target.book.id);
    setSelectedChapter(target.chapter);
    setSelectedVerseId(undefined);
  };

  const runSearch = async (
    event?: FormEvent<HTMLFormElement>,
    requestedQuery = query,
  ) => {
    event?.preventDefault();
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;
    setSearchError(undefined);
    if (!searchClient || !requestedQuery.trim()) {
      setSearchResults([]);
      setVisibleSearchResultCount(SEARCH_RESULTS_PAGE_SIZE);
      setSearchedQuery("");
      searchAbortRef.current = undefined;
      return;
    }
    setVisibleSearchResultCount(SEARCH_RESULTS_PAGE_SIZE);
    setSearching(true);
    performance.clearMarks("gys-bible-search-start");
    performance.mark("gys-bible-search-start");
    try {
      const results = await searchClient.search(
        requestedQuery,
        {
          ...(searchBook === "all" ||
          searchBook === "old" ||
          searchBook === "new"
            ? {}
            : { book: searchBook }),
          ...(searchBook === "old" || searchBook === "new"
            ? { testament: searchBook }
            : {}),
          exactPhrase,
          wholeWord,
        },
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setSearchResults(results);
      setSearchedQuery(requestedQuery.trim());
      setSearchHistory((current) => {
        const next = [
          requestedQuery.trim(),
          ...current.filter((value) => value !== requestedQuery.trim()),
        ];
        const limited = next.slice(0, 8);
        localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(limited));
        return limited;
      });
    } catch (error: unknown) {
      if (!controller.signal.aborted) {
        recordDiagnostic("error", "bible.search", error);
        setSearchError(
          error instanceof Error
            ? error.message
            : translate(locale, "bible.searchUnavailable"),
        );
      }
    } finally {
      if (searchAbortRef.current === controller) {
        searchAbortRef.current = undefined;
        setSearching(false);
      }
    }
  };

  const toggleBookmark = (id: string) => {
    hapticTick("medium");
    setBookmarks((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectVerse = (verse: BibleVerse) => {
    setSelectedVerseId((current) =>
      current === verse.id ? undefined : verse.id,
    );
  };

  const speakVerses = (verses: readonly BibleVerse[]) => {
    if (!verses.length || !speechAvailable) return;
    setSpeaking(true);
    const options = {
      rate: speechSnapshot.rate,
      pitch: speechSnapshot.pitch,
      volume: speechSnapshot.volume,
      languageTag: bibleLanguageTag,
      ...(speechSnapshot.voiceId ? { voiceId: speechSnapshot.voiceId } : {}),
    };
    void speechPlayer
      .speak(
        verses.map((verse) => ({
          id: verse.id,
          text: `${verse.verse}. ${cleanVerse(verse)}`,
          context: {
            path: `/bible#bible-verse-${encodeURIComponent(verse.id)}`,
            label: `${book?.name ?? "Alkitab"} ${verse.chapter}:${verse.verse}`,
          },
        })),
        options,
      )
      .finally(() => setSpeaking(false));
  };
  const speakChapter = () => {
    speakVerses(chapterVerses);
  };

  const copyText = async (
    text: string,
    message = translate(locale, "bible.copied"),
  ) => {
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
      return message;
    } catch {
      setCopied(false);
      return undefined;
    }
  };

  const copyChapter = async () => {
    if (!chapterVerses.length) return;
    await copyText(
      `${book?.name ?? ""} ${chapter}\n${chapterVerses
        .map((verse) => `${verse.verse}. ${cleanVerse(verse)}`)
        .join("\n")}`,
    );
  };

  useEffect(() => {
    if (packState.status !== "ready" || !book) {
      setBibleHeaderState(null);
      return;
    }

    setBibleHeaderState({
      active: true,
      bookName: book.name,
      chapter,
      totalChapters: book.chapters,
      verseCount: chapterVerses.length,
      versionCode: selectedVersionCode,
      versionOptions: bibleVersionOptions,
      onSelectVersion: (value) => {
        setSelectedVersionCode(value);
        localStorage.setItem(VERSION_KEY, value);
        setSearchResults([]);
        setVisibleSearchResultCount(SEARCH_RESULTS_PAGE_SIZE);
        setSearchedQuery("");
        setSelectedVerseId(undefined);
      },
      onOpenPicker: (trigger) => {
        if (suppressQuickNavClickRef.current) {
          suppressQuickNavClickRef.current = false;
          return;
        }
        openPickerModal(trigger);
      },
      startQuickNav,
      quickNavKeyDown,
      fontSize: typography.fontSize,
      minFontSize: BIBLE_FONT_SIZE_MIN,
      maxFontSize: BIBLE_FONT_SIZE_MAX,
      onIncreaseFontSize: () => changeFontSize(1),
      onDecreaseFontSize: () => changeFontSize(-1),
      splitView,
      onToggleSplitView: () => setSplitView((value) => !value),
      secondaryVersionCode,
      onSelectSecondaryVersion: setSecondaryVersionCode,
      syncScroll,
      onToggleSyncScroll: toggleSyncScroll,
      speechAvailable,
      speaking,
      speechStatus: speechSnapshot.status,
      onToggleSpeech: () => {
        if (speechSnapshot.status === "speaking") {
          void speechPlayer.pause();
        } else if (speechSnapshot.status === "paused") {
          void speechPlayer.resume();
        } else {
          if (book && chapterVerses.length) {
            void speechPlayer.speak(
              chapterVerses.map((verse) => ({
                id: verse.id,
                text: `${verse.verse}. ${cleanVerse(verse)}`,
                context: {
                  path: `/bible#bible-verse-${encodeURIComponent(verse.id)}`,
                  label: `${book.name} ${verse.chapter}:${verse.verse}`,
                },
              })),
              {
                rate: speechSnapshot.rate,
                pitch: speechSnapshot.pitch,
                volume: speechSnapshot.volume,
                languageTag: bibleLanguageTag,
                ...(speechSnapshot.voiceId
                  ? { voiceId: speechSnapshot.voiceId }
                  : {}),
              },
            );
          }
        }
      },
      copied,
      onCopyChapter: () => void copyChapter(),
      speechControlsOpen,
      onToggleSpeechControls: () =>
        setSpeechControlsOpen((current) => !current),
      searchOpen,
      onToggleSearch: () => {
        if (searchOpen) setSearchOpen(false);
        else focusBibleSearch();
      },
      onOpenNotes: () => setNotesPopupOpen(true),
      onFocusSearch: focusBibleSearch,
    });
  }, [
    packState.status,
    book,
    chapter,
    chapterVerses.length,
    selectedVersionCode,
    secondaryVersionCode,
    bibleVersionOptions,
    startQuickNav,
    quickNavKeyDown,
    openPickerModal,
    changeFontSize,
    typography.fontSize,
    splitView,
    syncScroll,
    speechAvailable,
    speaking,
    speechSnapshot.status,
    speechControlsOpen,
    searchOpen,
    focusBibleSearch,
    copied,
  ]);

  useEffect(() => {
    return () => setBibleHeaderState(null);
  }, []);

  const copySelected = async () => {
    if (!selectedVerse || !book) return;
    await copyText(
      `${book.name} ${chapter}:${selectedVerse.verse} ${cleanVerse(selectedVerse)}`,
    );
  };

  const shareSelected = async () => {
    if (!selectedVerse || !book) return;
    const text = `${book.name} ${chapter}:${selectedVerse.verse}\n${cleanVerse(selectedVerse)}`;
    if (navigator.share) {
      await navigator
        .share({ title: `${book.name} ${chapter}`, text })
        .catch(() => undefined);
    } else {
      await copyText(text);
    }
  };

  const copySelection = async () => {
    if (!selectionToolbar) return;
    await copyText(
      selectionToolbar.text,
      translate(locale, "bible.textCopied"),
    );
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(undefined);
  };

  const shareSelection = async () => {
    if (!selectionToolbar) return;
    if (navigator.share) {
      await navigator
        .share({
          title:
            `Alkitab ${packState.status === "ready" ? packState.pack.translation : ""}`.trim(),
          text: selectionToolbar.text,
        })
        .catch(() => undefined);
    } else {
      await copyText(selectionToolbar.text, "Teks tersalin");
    }
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(undefined);
  };

  const noteSelection = () => {
    if (selectionToolbar?.verseId) setSelectedVerseId(selectionToolbar.verseId);
    window.getSelection()?.removeAllRanges();
    setSelectionToolbar(undefined);
  };

  const saveNote = () => {
    if (!selectedVerseId) return;
    const text = noteDraft.trim();
    if (!text) {
      if (!selectedNoteId) return;
      const remaining = (notes[selectedVerseId] ?? []).filter(
        (note) => note.id !== selectedNoteId,
      );
      setNotes((current) => {
        const next = { ...current };
        if (remaining.length) next[selectedVerseId] = remaining;
        else delete next[selectedVerseId];
        return next;
      });
      setSelectedNoteId(remaining[0]?.id);
      setNoteDraft(remaining[0]?.text ?? "");
      return;
    }
    const noteId = selectedNoteId ?? makeBibleNoteId();
    setNotes((current) => {
      const verseNotes = current[selectedVerseId] ?? [];
      const index = verseNotes.findIndex((note) => note.id === noteId);
      const savedNote = { id: noteId, text };
      const next = { ...current };
      next[selectedVerseId] =
        index < 0
          ? [...verseNotes, savedNote]
          : verseNotes.map((note) => (note.id === noteId ? savedNote : note));
      return next;
    });
    setSelectedNoteId(noteId);
    setNoteDraft(text);
  };

  const beginNoteForSelectedVerse = () => {
    setSelectedNoteId(undefined);
    setNoteDraft("");
  };

  const setVerseHighlight = (verseId: string, color: string) => {
    setHighlights((current) => {
      const next = { ...current };
      if (next[verseId] === color) delete next[verseId];
      else next[verseId] = color;
      return next;
    });
  };

  const focusSelectedVerseNote = () => {
    setNotesPopupOpen(true);
    // focus after popup mounts
    window.setTimeout(() => {
      const note = document.querySelector<HTMLTextAreaElement>(
        ".bible-note-field textarea",
      );
      note?.focus();
    }, 50);
  };

  const addNoteForNewVerse = () => {
    setNotesPopupOpen(false);
    setPickerModalOpen(true);
  };

  const onVerseTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1)
      touchStartX.current = event.touches[0]?.clientX;
  };
  const onVerseTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
    const start = touchStartX.current;
    touchStartX.current = undefined;
    if (start === undefined) return;
    const end = event.changedTouches[0]?.clientX;
    if (end === undefined || Math.abs(end - start) < 64) return;
    navigateBy(end < start ? 1 : -1);
  };

  const hasSavedNotes = Object.keys(notes).length > 0;
  const verseById = useMemo(
    () =>
      new Map(
        hasSavedNotes && packState.status === "ready"
          ? packState.pack.verses.map((verse) => [verse.id, verse] as const)
          : [],
      ),
    [packState, hasSavedNotes],
  );
  const savedNotesList = useMemo(
    () =>
      Object.entries(notes)
        .flatMap(([noteVerseId, verseNotes]) =>
          verseNotes.map((note) => ({ noteVerseId, note })),
        )
        .map(({ noteVerseId, note }) => {
          const noteVerse = verseById.get(noteVerseId);
          return noteVerse
            ? {
                id: `${noteVerse.id}:${note.id}`,
                verseId: noteVerse.id,
                noteId: note.id,
                verse: noteVerse,
                text: note.text,
                label: `${books.find((candidate) => String(candidate.id) === noteVerse.book)?.name ?? noteVerse.book} ${noteVerse.chapter}:${noteVerse.verse}`,
              }
            : undefined;
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .filter(
          (entry) => !selectedVerseId || entry.verseId === selectedVerseId,
        )
        .sort((left, right) =>
          left.label.localeCompare(right.label, "id", { numeric: true }),
        ),
    [notes, verseById, books, selectedVerseId],
  );

  const splitStyle = {
    "--bible-split": `${splitRatio}%`,
    "--bible-font-size": `${typography.fontSize}px`,
    "--bible-line-height": `${typography.lineHeight}`,
  } as CSSProperties & {
    "--bible-split": string;
    "--bible-font-size": string;
    "--bible-line-height": string;
  };

  return (
    <div className="page bible-page" ref={pageZoomRef}>
      <BibleSearchPanel
        locale={locale}
        searchOpen={searchOpen}
        query={query}
        searchInputRef={searchInputRef}
        searching={searching}
        runSearch={runSearch}
        setQuery={setQuery}
        searchFiltersOpen={searchFiltersOpen}
        setSearchFiltersOpen={setSearchFiltersOpen}
        searchBook={searchBook}
        setSearchBook={setSearchBook}
        books={books}
        exactPhrase={exactPhrase}
        setExactPhrase={setExactPhrase}
        wholeWord={wholeWord}
        setWholeWord={setWholeWord}
        searchError={searchError}
        searchHistory={searchHistory}
        searchResults={searchResults}
        setSearchResults={setSearchResults}
        visibleSearchResultCount={visibleSearchResultCount}
        setVisibleSearchResultCount={setVisibleSearchResultCount}
        searchedQuery={searchedQuery}
        setSearchedQuery={setSearchedQuery}
        setSelectedBook={setSelectedBook}
        setSelectedChapter={setSelectedChapter}
        setSelectedVerseId={setSelectedVerseId}
        setSearchOpen={setSearchOpen}
      />

      {packState.status === "loading" && (
        <section
          className={`bible-reader bible-loading-reader${
            splitView ? " is-split" : ""
          }`}
          aria-label={translate(locale, "page.bibleTitle")}
          aria-busy="true"
          data-testid="bible-loading-reader"
        >
          <div
            className="bible-loading-status"
            role="status"
            aria-live="polite"
          >
            <span className="bible-loading-spinner" aria-hidden="true" />
            <span>{translate(locale, "bible.loading")}</span>
          </div>
          <div
            className={`bible-loading-layout${splitView ? " is-split" : ""}`}
            style={splitStyle}
          >
            {Array.from({ length: splitView ? 2 : 1 }, (_, paneIndex) => (
              <div
                className={`bible-loading-pane ${
                  paneIndex === 0 ? "is-primary" : "is-secondary"
                }`}
                key={paneIndex}
                aria-hidden="true"
              >
                <div className="bible-loading-heading">
                  <span className="bible-loading-line is-kicker" />
                  <span className="bible-loading-line is-title" />
                </div>
                <div className="bible-loading-verse-list">
                  {Array.from({ length: 7 }, (_, verseIndex) => (
                    <div className="bible-loading-verse" key={verseIndex}>
                      <span className="bible-loading-number" />
                      <span className="bible-loading-copy">
                        <span className="bible-loading-line" />
                        <span
                          className={`bible-loading-line${
                            verseIndex % 3 === 0 ? " is-short" : ""
                          }`}
                        />
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {splitView && (
              <div className="bible-loading-divider" aria-hidden="true" />
            )}
          </div>
        </section>
      )}
      {packState.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "bible.offlineError")}</strong>
          <span>{packState.message}</span>
          <button
            className="primary-button"
            type="button"
            onClick={() => {
              setPackState({ status: "loading" });
              setPackAttempt((attempt) => attempt + 1);
            }}
          >
            {translate(locale, "bible.retry")}
          </button>
        </div>
      )}

      {packState.status === "ready" && book && (
        <section
          className={`bible-reader${splitView ? " is-split" : ""}`}
          aria-label={translate(locale, "page.bibleTitle")}
        >
          <div
            className="bible-reader-layout"
            ref={splitLayoutRef}
            style={splitStyle}
          >
            <ChapterPane
              locale={locale}
              book={book}
              chapter={chapter}
              verses={chapterVerses}
              translation={packState.pack.translation}
              pericopes={packState.pack.pericopes}
              crossRefs={packState.pack.crossRefs}
              onOpenCrossRefs={(id, refs, title) => {
                setCrossRefModal({ pericopeId: id, title, refs });
              }}
              onSelectParallel={(bId, ch, v) => {
                setSelectedBook(bId);
                setSelectedChapter(ch);
                setSelectedVerseId(`${bId}:${ch}:${v}`);
              }}
              bookmarks={bookmarks}
              highlights={highlights}
              selectedVerseId={selectedVerseId}
              speakingVerseId={speakingVerseId}
              searchQuery={query}
              scrollRef={primaryScrollRef}
              onScroll={onPrimaryScroll}
              onSelect={selectVerse}
              onBookmark={toggleBookmark}
              onTouchStart={onVerseTouchStart}
              onTouchEnd={onVerseTouchEnd}
            />
            {splitView && (
              <div
                className="bible-split-divider"
                role="separator"
                aria-label={translate(locale, "bible.splitResize")}
                aria-orientation="vertical"
                aria-valuemin={20}
                aria-valuemax={80}
                aria-valuenow={splitRatio}
                tabIndex={0}
                onPointerDown={startSplitDrag}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft" || event.key === "ArrowUp")
                    setSplitRatio((value) => Math.max(20, value - 2));
                  if (event.key === "ArrowRight" || event.key === "ArrowDown")
                    setSplitRatio((value) => Math.min(80, value + 2));
                }}
              >
                <span aria-hidden="true" />
              </div>
            )}
            {splitView &&
              (() => {
                if (secondaryPackState.status === "loading") {
                  return (
                    <div className="bible-pane-secondary bible-side-empty">
                      {translate(locale, "bible.secondaryLoading")}
                    </div>
                  );
                }
                if (secondaryPackState.status === "error") {
                  return (
                    <div className="bible-pane-secondary bible-side-empty">
                      <span>
                        {translate(locale, "bible.secondaryError", {
                          version:
                            bibleVersionOptions.find(
                              (option) => option.value === secondaryVersionCode,
                            )?.shortLabel ??
                            secondaryVersionCode
                              .replace(/^b_/u, "")
                              .toUpperCase(),
                        })}
                      </span>
                      <br />
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          setSecondaryPackAttempt((attempt) => attempt + 1)
                        }
                      >
                        {translate(locale, "bible.retry")}
                      </button>
                    </div>
                  );
                }
                const secPack = secondaryPackState.pack;
                if (!secondaryChapter) return null;
                const { book: secBook, verses: secVerses } = secondaryChapter;
                return (
                  <ChapterPane
                    locale={locale}
                    book={secBook}
                    chapter={chapter}
                    verses={secVerses}
                    translation={secPack.translation}
                    pericopes={secPack.pericopes}
                    crossRefs={secPack.crossRefs}
                    onOpenCrossRefs={(id, refs, title) => {
                      setCrossRefModal({ pericopeId: id, title, refs });
                    }}
                    onSelectParallel={(bId, ch, v) => {
                      setSelectedBook(bId);
                      setSelectedChapter(ch);
                      setSelectedVerseId(`${bId}:${ch}:${v}`);
                    }}
                    bookmarks={EMPTY_BOOKMARKS}
                    highlights={EMPTY_HIGHLIGHTS}
                    selectedVerseId={selectedVerseId}
                    speakingVerseId={speakingVerseId}
                    searchQuery={query}
                    secondary
                    scrollRef={secondaryScrollRef}
                    onScroll={onSecondaryScroll}
                    onSelect={selectVerse}
                    onBookmark={toggleBookmark}
                  />
                );
              })()}
          </div>
          {quickNavDrag &&
            createPortal(
              <BibleQuickNavOverlay
                books={books}
                dragState={quickNavDrag}
                locale={locale}
              />,
              document.body,
            )}
          {quickNavDrag &&
            createPortal(
              <div
                className="quick-nav-multistep"
                data-step={quickNavDrag.activeColumn}
              >
                <span>
                  {translate(locale, "bible.quickStep")}{" "}
                  {quickNavDrag.activeColumn === "book"
                    ? `1/3 · ${translate(locale, "bible.quickBook")}`
                    : quickNavDrag.activeColumn === "chapter"
                      ? `2/3 · ${translate(locale, "bible.quickChapter")}`
                      : `3/3 · ${translate(locale, "bible.quickVerse")}`}{" "}
                  —{" "}
                  {quickNavDrag.activeColumn === "verse"
                    ? translate(locale, "bible.quickRelease")
                    : translate(locale, "bible.quickContinue")}
                </span>
              </div>,
              document.body,
            )}
          <div className="reader-pagination">
            <button
              className="quiet-button"
              type="button"
              onClick={() => navigateBy(-1)}
              disabled={!findNextTarget(books, book, chapter, -1)}
            >
              {translate(locale, "bible.previous")}
            </button>
            <span>
              {book.name} {chapter}
            </span>
            <button
              className="quiet-button"
              type="button"
              onClick={() => navigateBy(1)}
              disabled={!nextTarget}
            >
              {translate(locale, "bible.next")}
            </button>
          </div>
        </section>
      )}
      <BibleNotesPopup
        locale={locale}
        notesPopupOpen={notesPopupOpen}
        setNotesPopupOpen={setNotesPopupOpen}
        savedNotesList={savedNotesList}
        bookmarks={bookmarks}
        selectedVerse={selectedVerse}
        book={book}
        chapter={chapter}
        noteDraft={noteDraft}
        setNoteDraft={setNoteDraft}
        saveNote={saveNote}
        selectedVerseId={selectedVerseId}
        beginNoteForSelectedVerse={beginNoteForSelectedVerse}
        addNoteForNewVerse={addNoteForNewVerse}
        setSelectedBook={setSelectedBook}
        setSelectedChapter={setSelectedChapter}
        setSelectedVerseId={setSelectedVerseId}
        setSelectedNoteId={setSelectedNoteId}
        notes={notes}
        setNotes={setNotes}
        selectedNoteId={selectedNoteId}
      />
      {packState.status === "ready" &&
        book &&
        createPortal(
          <BiblePickerModal
            open={pickerModalOpen}
            onClose={closePickerModal}
            restoreFocusTarget={pickerTriggerRef.current}
            books={books}
            currentBookId={book.id}
            currentChapter={chapter}
            currentVerse={selectedVerse?.verse}
            allVerses={packState.pack.verses}
            onSelect={(target) => {
              setSelectedBook(target.bookId);
              setSelectedChapter(target.chapter);
              if (target.verse) {
                setSelectedVerseId(
                  `${target.bookId}:${target.chapter}:${target.verse}`,
                );
              } else {
                setSelectedVerseId(undefined);
              }
            }}
            locale={locale}
          />,
          document.body,
        )}
      {activeToolbarVerse &&
        book &&
        createPortal(
          <div
            className={`selected-verse-toolbar${exitingVerse ? " is-exiting" : ""}`}
            data-testid="selected-verse-toolbar"
            role="toolbar"
            aria-label={translate(locale, "bible.selectedVerseActions")}
          >
            <div className="selected-verse-context">
              <strong>
                {book.name} {chapter}:{activeToolbarVerse.verse}
              </strong>
              <span>{cleanVerse(activeToolbarVerse)}</span>
            </div>
            <div className="selected-verse-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => void copySelected()}
              >
                {translate(locale, "bible.copy")}
              </button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void shareSelected()}
              >
                {translate(locale, "bible.share")}
              </button>
              <button
                className="quiet-button"
                type="button"
                disabled={!speechAvailable}
                onClick={() => speakVerses([activeToolbarVerse])}
              >
                {translate(locale, "bible.readVerse")}
              </button>
              <div
                className="selected-verse-highlights"
                aria-label={translate(locale, "bible.highlightColor")}
              >
                {DEFAULT_HIGHLIGHT_COLORS.map((color) => {
                  const active = highlights[activeToolbarVerse.id] === color;
                  const colorName = translate(
                    locale,
                    color === "yellow"
                      ? "bible.colorYellow"
                      : color === "blue"
                        ? "bible.colorBlue"
                        : "bible.colorGreen",
                  );
                  return (
                    <button
                      className={`highlight-dot is-${color}${active ? " is-active" : ""}`}
                      key={color}
                      type="button"
                      aria-label={translate(
                        locale,
                        active ? "bible.unhighlight" : "bible.highlight",
                        { color: colorName },
                      )}
                      aria-pressed={active}
                      onClick={() =>
                        setVerseHighlight(activeToolbarVerse.id, color)
                      }
                    />
                  );
                })}
                {customHighlightColors.map((color) => {
                  const active = highlights[activeToolbarVerse.id] === color;
                  return (
                    <button
                      className={`highlight-dot is-custom${active ? " is-active" : ""}`}
                      key={color}
                      type="button"
                      style={{ "--highlight-color": color } as CSSProperties}
                      aria-label={translate(
                        locale,
                        active ? "bible.unhighlight" : "bible.highlight",
                        { color },
                      )}
                      aria-pressed={active}
                      onClick={() =>
                        setVerseHighlight(activeToolbarVerse.id, color)
                      }
                    />
                  );
                })}
                <input
                  type="color"
                  aria-label={translate(locale, "bible.customHighlightColor")}
                  value={customHighlightColors[0] ?? "#b54747"}
                  onChange={(event) => {
                    const color = event.currentTarget.value.toLowerCase();
                    setCustomHighlightColors((current) =>
                      [
                        color,
                        ...current.filter((entry) => entry !== color),
                      ].slice(0, MAX_CUSTOM_HIGHLIGHT_COLORS),
                    );
                    setVerseHighlight(activeToolbarVerse.id, color);
                  }}
                />
              </div>
              <button
                className="quiet-button"
                type="button"
                onClick={focusSelectedVerseNote}
              >
                {translate(locale, "bible.notes")}
              </button>
              <button
                className="selected-verse-close"
                type="button"
                aria-label={translate(locale, "bible.closeSelectedVerse")}
                onClick={handleCloseSelectedVerse}
              >
                ×
              </button>
            </div>
          </div>,
          document.body,
        )}
      {selectionToolbar && (
        <div
          className="selection-toolbar"
          role="toolbar"
          aria-label={translate(locale, "bible.textActions")}
          style={{ left: selectionToolbar.left, top: selectionToolbar.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => void copySelection()}>
            {translate(locale, "bible.copy")}
          </button>
          <button type="button" onClick={() => void shareSelection()}>
            {translate(locale, "bible.share")}
          </button>
          {selectionToolbar.verseId && (
            <button type="button" onClick={noteSelection}>
              {translate(locale, "bible.noteAction")}
            </button>
          )}
          <button
            type="button"
            aria-label={translate(locale, "bible.closeTextActions")}
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setSelectionToolbar(undefined);
            }}
          >
            ×
          </button>
        </div>
      )}
      {crossRefModal &&
        createPortal(
          <div
            className="bible-crossref-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={`${translate(locale, "bible.crossReferences")}: ${crossRefModal.title}`}
            onClick={() => setCrossRefModal(undefined)}
          >
            <div
              className="bible-crossref-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="bible-crossref-header">
                <div>
                  <small>{translate(locale, "bible.crossReferences")}</small>
                  <strong>{crossRefModal.title}</strong>
                </div>
                <button
                  type="button"
                  aria-label={translate(locale, "bible.closeCrossReferences")}
                  onClick={() => setCrossRefModal(undefined)}
                >
                  ×
                </button>
              </div>
              <div className="bible-crossref-list">
                {crossRefModal.refs.map((ref, idx) => {
                  const pack =
                    packState.status === "ready"
                      ? packState.pack
                      : secondaryPackState.status === "ready"
                        ? secondaryPackState.pack
                        : undefined;
                  const bookName =
                    pack?.books.find((b) => String(b.id) === ref.book)?.name ??
                    `Kitab ${ref.book}`;
                  const endBook = ref.endBook ?? ref.book;
                  const endChapter = ref.endChapter ?? ref.chapter;
                  const endBookName =
                    pack?.books.find((b) => String(b.id) === endBook)?.name ??
                    `Kitab ${endBook}`;
                  const label = `${bookName} ${ref.chapter}:${ref.verse}${ref.endVerse ? (endBook === ref.book && endChapter === ref.chapter ? `-${ref.endVerse}` : ` – ${endBookName} ${endChapter}:${ref.endVerse}`) : ""}`;
                  const startId =
                    Number(ref.book) * 1_000_000 +
                    ref.chapter * 1000 +
                    ref.verse;
                  const endId = ref.endVerse
                    ? Number(endBook) * 1_000_000 +
                      endChapter * 1000 +
                      ref.endVerse
                    : startId;
                  const snippet = pack?.verses
                    .filter((verse) => {
                      const id =
                        Number(verse.book) * 1_000_000 +
                        verse.chapter * 1000 +
                        verse.verse;
                      return id >= startId && id <= endId;
                    })
                    .map((verse) => `${verse.verse}. ${cleanVerse(verse)}`)
                    .join(" ");
                  return (
                    <button
                      key={`${ref.book}:${ref.chapter}:${ref.verse}-${idx}`}
                      type="button"
                      className="bible-crossref-card"
                      onClick={() => {
                        const bookId = Number(ref.book);
                        setSelectedBook(bookId);
                        setSelectedChapter(ref.chapter);
                        setSelectedVerseId(
                          `${bookId}:${ref.chapter}:${ref.verse}`,
                        );
                        setCrossRefModal(undefined);
                        // ensure primary version is used for navigation; secondary will sync via same book/chapter
                      }}
                    >
                      <span className="bible-crossref-card-header">
                        <strong className="bible-crossref-ref-tag">
                          {label}
                        </strong>
                        <Icon name="arrow" size={12} />
                      </span>
                      {snippet && (
                        <span className="bible-crossref-snippet">
                          {snippet}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <p className="bible-crossref-hint">
                {translate(locale, "bible.crossReferenceHint", {
                  count: crossRefModal.refs.length,
                })}
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
