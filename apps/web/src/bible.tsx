import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  BibleReaderPackSchema,
  SpeechEnginePreferenceSchema,
  type BibleBook,
  type BibleReaderPack,
} from "@gys/contracts";
import { sanitizeBibleText, type BibleVerse } from "@gys/domain";
import { Link, useSearchParams } from "react-router-dom";
import { translate, type Locale } from "./i18n.js";
import {
  bibleBookNames,
  parseBibleDeepLink,
  resolveBibleDeepLink,
} from "./global-bible-search.js";
import { Select } from "./select.js";
import { setBibleActivity } from "./history.js";
import { speechPlayer } from "./speech-player.js";
import { BibleSearchClient } from "./bible-search.js";
import {
  calculateProportionalScroll,
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
  scrubChapterNumber,
  type QuickNavDragState,
} from "./bible-quick-nav.js";
import {
  getDistributedAssetManager,
  type ManagedDistributedAsset,
} from "./distributed-asset-manager.js";
import { loadBibleReaderPack } from "./bible-distributed.js";
import { Icon } from "./icons.js";

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

const BOOK_KEY = "gys-bible-book";
const CHAPTER_KEY = "gys-bible-chapter";
const BOOKMARKS_KEY = "gys-bible-bookmarks";
const NOTES_KEY = "gys-bible-notes-v1";
const HIGHLIGHTS_KEY = "gys-bible-highlights-v1";
const SEARCH_HISTORY_KEY = "gys-bible-search-history-v1";
const VERSION_KEY = "gys-bible-version-v1";

function readSavedNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const saved = Number(localStorage.getItem(key));
  return Number.isInteger(saved) && saved > 0 ? saved : fallback;
}

function readSavedVersion(): string {
  if (typeof window === "undefined") return "b_tb";
  return localStorage.getItem(VERSION_KEY) ?? "b_tb";
}

function readStringSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

function readStringMap(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

function readSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(SEARCH_HISTORY_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? value
          .filter((entry): entry is string => typeof entry === "string")
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!terms.length) return <>{text}</>;
  const matcher = new RegExp(`(${terms.join("|")})`, "ig");
  return (
    <>
      {text
        .split(matcher)
        .map((part, index) =>
          terms.some((term) => new RegExp(`^${term}$`, "i").test(part)) ? (
            <mark key={`${part}-${index}`}>{part}</mark>
          ) : (
            <span key={`${part}-${index}`}>{part}</span>
          ),
        )}
    </>
  );
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

function ChapterPane({
  book,
  chapter,
  verses,
  translation,
  bookmarks,
  highlights,
  selectedVerseId,
  speakingVerseId,
  searchQuery,
  secondary = false,
  scrollRef,
  onScroll,
  onSelect,
  onBookmark,
  onTouchStart,
  onTouchEnd,
}: {
  book: BibleBook;
  chapter: number;
  verses: BibleVerse[];
  translation: string;
  bookmarks: Set<string>;
  highlights: Record<string, string>;
  selectedVerseId?: string | undefined;
  speakingVerseId?: string | undefined;
  searchQuery: string;
  secondary?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  onSelect: (verse: BibleVerse) => void;
  onBookmark: (id: string) => void;
  onTouchStart?: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd?: (event: TouchEvent<HTMLDivElement>) => void;
}) {
  return (
    <section
      className={`bible-pane${secondary ? " bible-pane-secondary" : ""}`}
      aria-label={`${book.name} ${chapter}`}
    >
      <div className="reader-heading">
        <div>
          <p className="date-line">{translation}</p>
          <h2>
            {book.name} {chapter}
          </h2>
        </div>
        <span>{verses.length} ayat</span>
      </div>
      <div
        className="verse-list"
        ref={scrollRef}
        onScroll={onScroll}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {verses.map((verse) => {
          const selected = selectedVerseId === verse.id;
          const speaking = speakingVerseId === verse.id;
          const highlight = highlights[verse.id];
          return (
            <article
              className={`verse-row${selected ? " is-selected" : ""}${speaking ? " is-speaking" : ""}${highlight ? ` is-highlight-${highlight}` : ""}`}
              id={`bible-verse-${verse.id}`}
              key={verse.id}
              aria-current={speaking ? "true" : undefined}
            >
              <button
                className={`verse-number${bookmarks.has(verse.id) ? " is-bookmarked" : ""}`}
                type="button"
                onClick={() => onBookmark(verse.id)}
                aria-label={`Tandai ayat ${verse.verse}`}
                aria-pressed={bookmarks.has(verse.id)}
              >
                {verse.verse}
              </button>
              <button
                className="verse-text"
                type="button"
                onClick={() => onSelect(verse)}
                aria-pressed={selected}
              >
                <HighlightedText text={cleanVerse(verse)} query={searchQuery} />
              </button>
              {speaking && (
                <span className="sr-only" role="status">
                  Sedang dibacakan: ayat {verse.verse}
                </span>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function BiblePage({ locale }: { locale: Locale }) {
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
    readSavedNumber(BOOK_KEY, 43),
  );
  const [selectedChapter, setSelectedChapter] = useState(() =>
    readSavedNumber(CHAPTER_KEY, 3),
  );
  const [query, setQuery] = useState("");
  const [searchBook, setSearchBook] = useState("all");
  const [exactPhrase, setExactPhrase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [searchFiltersOpen, setSearchFiltersOpen] = useState(() =>
    typeof window === "undefined" ? true : window.innerWidth >= 600,
  );
  const [searchResults, setSearchResults] = useState<BibleVerse[]>([]);
  const [searchedQuery, setSearchedQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [searchHistory, setSearchHistory] = useState(readSearchHistory);
  const [bookmarks, setBookmarks] = useState<Set<string>>(() =>
    readStringSet(BOOKMARKS_KEY),
  );
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    readStringMap(NOTES_KEY),
  );
  const [highlights, setHighlights] = useState<Record<string, string>>(() =>
    readStringMap(HIGHLIGHTS_KEY),
  );
  const [selectedVerseId, setSelectedVerseId] = useState<string>();
  const [noteDraft, setNoteDraft] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [speechControlsOpen, setSpeechControlsOpen] = useState(false);
  const [readerActionsOpen, setReaderActionsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectionToolbar, setSelectionToolbar] = useState<
    SelectionToolbarState | undefined
  >();
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
  const primaryScrollRef = useRef<HTMLDivElement | null>(null);
  const secondaryScrollRef = useRef<HTMLDivElement | null>(null);
  const isSyncingRef = useRef(false);

  const [pickerModalOpen, setPickerModalOpen] = useState(false);
  const [packAttempt, setPackAttempt] = useState(0);
  const [quickNavDrag, setQuickNavDrag] = useState<
    QuickNavDragState | undefined
  >(undefined);
  const touchStartX = useRef<number | undefined>(undefined);
  const searchAbortRef = useRef<AbortController | undefined>(undefined);
  const quickNavRef = useRef<
    | {
        pointerId: number;
        startX: number;
        startY: number;
        startTime: number;
        hasDragged: boolean;
        initialChapter: number;
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
  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 600px)");
    const syncSearchFilters = () => setSearchFiltersOpen(mediaQuery.matches);
    syncSearchFilters();
    mediaQuery.addEventListener("change", syncSearchFilters);
    return () => mediaQuery.removeEventListener("change", syncSearchFilters);
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

  const startQuickNav = (event: ReactPointerEvent<HTMLDivElement>) => {
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
      initialChapter: chapter,
      currentBookId: bookId,
      currentChapter: chapter,
      currentVerse: 1,
    };
  };

  const quickNavKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!book) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setPickerModalOpen(true);
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      setSelectedChapter((value) => Math.max(1, value - 1));
    } else if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      setSelectedChapter((value) => Math.min(book.chapters, value + 1));
    }
  };

  const onPrimaryScroll = () => {
    if (!splitView || !syncScroll || isSyncingRef.current) return;
    const primary = primaryScrollRef.current;
    const secondary = secondaryScrollRef.current;
    if (!primary || !secondary) return;
    isSyncingRef.current = true;
    const targetTop = calculateProportionalScroll(
      primary.scrollTop,
      primary.scrollHeight,
      primary.clientHeight,
      secondary.scrollHeight,
      secondary.clientHeight,
    );
    secondary.scrollTop = targetTop;
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
    const targetTop = calculateProportionalScroll(
      secondary.scrollTop,
      secondary.scrollHeight,
      secondary.clientHeight,
      primary.scrollHeight,
      primary.clientHeight,
    );
    primary.scrollTop = targetTop;
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
    if (!deepLink || packState.status !== "ready") return;
    const key = `${deepLink.book}:${deepLink.chapter}:${deepLink.verse}`;
    if (lastAppliedDeepLinkRef.current === key) return;
    const resolved = resolveBibleDeepLink(packState.pack, deepLink);
    if (!resolved) return;
    lastAppliedDeepLinkRef.current = key;
    setSelectedBook(resolved.bookId);
    setSelectedChapter(resolved.chapter);
    setSelectedVerseId(
      `${resolved.bookId}:${resolved.chapter}:${resolved.verse}`,
    );
  }, [deepLink, packState]);

  useEffect(() => {
    const controller = new AbortController();
    setPackState({ status: "loading" });
    const request =
      selectedVersionCode === "b_tb"
        ? fetch(`${import.meta.env.BASE_URL}offline/bible/tb-reader.json`, {
            signal: controller.signal,
            cache: "force-cache",
          }).then(async (response) => {
            if (!response.ok)
              throw new Error("Offline TB reader pack unavailable");
            const json: unknown = await response.json();
            const parsed = BibleReaderPackSchema.safeParse(json);
            if (!parsed.success) throw new Error("TB reader pack is invalid");
            return parsed.data;
          })
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

  const searchClient = useMemo(
    () =>
      packState.status === "ready"
        ? new BibleSearchClient(
            packState.pack.verses,
            undefined,
            bibleBookNames(packState.pack),
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
    { value: "b_tb", label: "Terjemahan Baru" },
    ...bibleAssets
      .filter(
        (asset) =>
          asset.code !== "b_tb" &&
          (asset.state === "installed" || asset.state === "update"),
      )
      .map((asset) => ({ value: asset.code, label: asset.title })),
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
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const active = quickNavRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      const dx = event.clientX - active.startX;
      const dy = event.clientY - active.startY;

      if (!active.hasDragged && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
        active.hasDragged = true;
      }

      if (!active.hasDragged) return;

      event.preventDefault();
      let nextBookId = active.currentBookId;
      let nextChapter = active.currentChapter;
      let nextVerse = active.currentVerse;

      const currentB =
        books.find((candidate) => candidate.id === active.currentBookId) ??
        book;
      if (currentB) {
        nextChapter = scrubChapterNumber(
          active.initialChapter,
          dy,
          currentB.chapters,
          48,
        );
        nextVerse = 1;
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

      const currentBookObj = books.find((b) => b.id === nextBookId) ?? book;
      const totalVersesCount =
        packState.status === "ready"
          ? packState.pack.verses.filter(
              (v) => v.book === String(nextBookId) && v.chapter === nextChapter,
            ).length
          : 30;

      setSelectedBook(nextBookId);
      setSelectedChapter(nextChapter);

      setQuickNavDrag({
        activeColumn: "chapter",
        bookId: nextBookId,
        chapter: nextChapter,
        verse: nextVerse,
        bookName: currentBookObj?.name ?? "Alkitab",
        totalChapters: currentBookObj?.chapters ?? 1,
        totalVerses: totalVersesCount || 30,
      });
    };

    const end = (event: PointerEvent) => {
      const active = quickNavRef.current;
      if (!active || active.pointerId !== event.pointerId) return;

      if (active.hasDragged) {
        suppressQuickNavClickRef.current = true;
        if (active.currentVerse > 1) {
          setSelectedVerseId(
            `${active.currentBookId}:${active.currentChapter}:${active.currentVerse}`,
          );
        }
        quickNavRef.current = undefined;
        window.setTimeout(() => setQuickNavDrag(undefined), 120);
        window.setTimeout(() => {
          suppressQuickNavClickRef.current = false;
        }, 0);
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
  const nextTarget = book ? findNextTarget(books, book, chapter, 1) : undefined;
  const nextVerses = useMemo(() => {
    if (packState.status !== "ready" || !nextTarget) return [];
    return packState.pack.verses.filter(
      (verse) =>
        verse.book === String(nextTarget.book.id) &&
        verse.chapter === nextTarget.chapter,
    );
  }, [nextTarget, packState]);
  const selectedVerse = selectedVerseId
    ? chapterVerses.find((verse) => verse.id === selectedVerseId)
    : undefined;
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
  const availableSpeechVoices = speechSnapshot.voices.filter((voice) =>
    speechSnapshot.engine === "edge" ? !voice.local : voice.local,
  );
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
    setSelectedBook(book.id);
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
    if (!selectedVerseId) {
      setNoteDraft("");
      return;
    }
    setNoteDraft(notes[selectedVerseId] ?? "");
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
      setSearchedQuery("");
      searchAbortRef.current = undefined;
      return;
    }
    setSearching(true);
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
            : "Pencarian Alkitab tidak tersedia.",
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

  const copyText = async (text: string, message = "Tersalin") => {
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
    await copyText(selectionToolbar.text, "Teks tersalin");
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
    setNotes((current) => {
      const next = { ...current };
      if (noteDraft.trim()) next[selectedVerseId] = noteDraft.trim();
      else delete next[selectedVerseId];
      return next;
    });
  };

  const focusSelectedVerseNote = () => {
    const note = document.querySelector<HTMLTextAreaElement>(
      ".bible-note-field textarea",
    );
    note?.scrollIntoView({ behavior: "smooth", block: "center" });
    note?.focus();
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

  const renderSidePanel = (): ReactNode => (
    <aside className="bible-side-panel" aria-label="Alat bantu bacaan">
      <div className="section-title-row">
        <div>
          <p className="date-line">Bacaan tersimpan</p>
          <h2>Catatan & ayat</h2>
        </div>
        <span>{bookmarks.size}</span>
      </div>
      {selectedVerse ? (
        <div className="bible-selection-panel">
          <strong>
            {book?.name} {chapter}:{selectedVerse.verse}
          </strong>
          <p>{cleanVerse(selectedVerse)}</p>
          <label className="bible-note-field">
            <span>Catatan pribadi</span>
            <textarea
              value={noteDraft}
              rows={3}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Tulis renungan singkat…"
            />
          </label>
          <button className="primary-button" type="button" onClick={saveNote}>
            Simpan catatan
          </button>
        </div>
      ) : (
        <p className="bible-side-empty">
          Pilih ayat untuk menyalin, menyorot, atau menambahkan catatan.
        </p>
      )}
      <div className="bible-bookmark-list">
        {[...bookmarks]
          .map((id) =>
            packState.status === "ready"
              ? packState.pack.verses.find((verse) => verse.id === id)
              : undefined,
          )
          .filter((verse): verse is BibleVerse => Boolean(verse))
          .slice(0, 8)
          .map((verse) => (
            <button
              className="bible-bookmark-item"
              type="button"
              key={verse.id}
              onClick={() => {
                setSelectedBook(Number(verse.book));
                setSelectedChapter(verse.chapter);
                setSelectedVerseId(verse.id);
              }}
            >
              <strong>
                {books.find((candidate) => String(candidate.id) === verse.book)
                  ?.name ?? verse.book}{" "}
                {verse.chapter}:{verse.verse}
              </strong>
              <span>{cleanVerse(verse)}</span>
            </button>
          ))}
      </div>
    </aside>
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
    <div className="page bible-page">
      <header
        className={`bible-page-header${query || searchResults.length ? " is-search-active" : ""}`}
      >
        <h1 className="sr-only">{translate(locale, "page.bibleTitle")}</h1>
        <form
          className={`bible-search${query || searchResults.length ? " is-active" : ""}`}
          onSubmit={(event) => void runSearch(event)}
          role="search"
        >
          <label htmlFor="bible-query">
            {translate(locale, "bible.search")}
          </label>
          <div className="search-row">
            <input
              id="bible-query"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translate(locale, "bible.searchPlaceholder")}
            />
            <button
              className="primary-button"
              type="submit"
              disabled={searching}
            >
              {searching ? "…" : translate(locale, "bible.searchAction")}
            </button>
          </div>
          <details
            className="bible-search-options-disclosure"
            open={
              searchFiltersOpen ||
              (typeof window !== "undefined" && window.innerWidth >= 600)
            }
            onToggle={(event) => setSearchFiltersOpen(event.currentTarget.open)}
          >
            <summary>Filter pencarian</summary>
            <div className="bible-search-options">
              <Select
                value={searchBook}
                onChange={setSearchBook}
                label="Kitab"
                options={[
                  { value: "all", label: "Semua kitab" },
                  { value: "old", label: "Perjanjian Lama (39)" },
                  { value: "new", label: "Perjanjian Baru (27)" },
                  ...books.map((candidate) => ({
                    value: String(candidate.id),
                    label: candidate.name,
                  })),
                ]}
              />
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={exactPhrase}
                  onChange={(event) => setExactPhrase(event.target.checked)}
                />{" "}
                Frasa tepat
              </label>
              <label className="check-option">
                <input
                  type="checkbox"
                  checked={wholeWord}
                  onChange={(event) => setWholeWord(event.target.checked)}
                />{" "}
                Kata utuh
              </label>
            </div>
          </details>
          {searchError && (
            <div className="inline-error" role="alert">
              <span>{searchError}</span>
              <button
                className="text-button"
                type="button"
                onClick={() => void runSearch(undefined, query)}
                disabled={searching || !query.trim()}
              >
                Coba lagi
              </button>
            </div>
          )}
          {searchHistory.length > 0 && !query && (
            <div
              className="bible-search-history"
              aria-label="Pencarian terakhir"
            >
              {searchHistory.map((entry) => (
                <button
                  key={entry}
                  type="button"
                  onClick={() => {
                    setQuery(entry);
                    void runSearch(undefined, entry);
                  }}
                >
                  {entry}
                </button>
              ))}
            </div>
          )}
        </form>
      </header>

      {searchResults.length > 0 && (
        <section
          className="search-results"
          aria-label={translate(locale, "bible.results")}
        >
          <div className="section-title-row">
            <h2>{translate(locale, "bible.results")}</h2>
            <button
              className="text-button"
              type="button"
              onClick={() => {
                setSearchResults([]);
                setSearchedQuery("");
              }}
            >
              {translate(locale, "bible.closeResults")}
            </button>
          </div>
          <div className="result-list">
            {searchResults.slice(0, 40).map((result) => (
              <button
                className="result-item"
                key={result.id}
                type="button"
                onClick={() => {
                  setSelectedBook(Number(result.book));
                  setSelectedChapter(result.chapter);
                  setSelectedVerseId(result.id);
                  setSearchResults([]);
                  setSearchedQuery("");
                }}
              >
                <strong>
                  {books.find(
                    (candidate) => String(candidate.id) === result.book,
                  )?.name ?? result.book}{" "}
                  {result.chapter}:{result.verse}
                </strong>
                <span>
                  <HighlightedText text={cleanVerse(result)} query={query} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
      {searchedQuery &&
        !searching &&
        !searchError &&
        searchResults.length === 0 &&
        searchedQuery === query.trim() && (
          <div className="empty-panel" role="status">
            {translate(locale, "bible.noResults")}
          </div>
        )}

      {packState.status === "loading" && (
        <div className="loading-panel" role="status">
          {translate(locale, "bible.loading")}
        </div>
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
          {quickNavDrag && (
            <BibleQuickNavOverlay books={books} dragState={quickNavDrag} />
          )}
          <div className="reader-toolbar">
            <div className="reader-navigation-group">
              <div
                className="reader-toolbar-title quick-nav-handle"
                onPointerDown={startQuickNav}
                onClick={() => {
                  if (suppressQuickNavClickRef.current) return;
                  setPickerModalOpen(true);
                }}
                onKeyDown={quickNavKeyDown}
                role="button"
                tabIndex={0}
                aria-label="Geser judul untuk berpindah pasal"
              >
                <span>Geser untuk navigasi</span>
                <strong>
                  {book.name} {chapter}
                </strong>
                <small>{chapterVerses.length} ayat</small>
              </div>
              <div className="reader-selectors">
                <Select
                  value={selectedVersionCode}
                  onChange={(value) => {
                    setSelectedVersionCode(value);
                    localStorage.setItem(VERSION_KEY, value);
                    setSearchResults([]);
                    setSearchedQuery("");
                    setSelectedVerseId(undefined);
                  }}
                  label="Versi"
                  options={bibleVersionOptions}
                />
                <Select
                  value={book.id}
                  onChange={(value) => {
                    setSelectedBook(value);
                    setSelectedChapter(1);
                  }}
                  label={translate(locale, "bible.book")}
                  options={books.map((option) => ({
                    value: option.id,
                    label: option.name,
                  }))}
                />
                <Select
                  value={chapter}
                  onChange={setSelectedChapter}
                  label={translate(locale, "bible.chapter")}
                  options={Array.from(
                    { length: book.chapters },
                    (_, index) => ({
                      value: index + 1,
                      label: String(index + 1),
                    }),
                  )}
                />
              </div>
              <div
                className="bible-typography-controls"
                role="group"
                aria-label="Ukuran teks bacaan"
              >
                <button
                  type="button"
                  onClick={() =>
                    setTypography((current) => {
                      const next = decreaseBibleFontSize(current);
                      writeBibleTypography(next);
                      return next;
                    })
                  }
                  disabled={typography.fontSize <= BIBLE_FONT_SIZE_MIN}
                  aria-label="Perkecil teks"
                >
                  A−
                </button>
                <output aria-live="polite">{typography.fontSize}</output>
                <button
                  type="button"
                  onClick={() =>
                    setTypography((current) => {
                      const next = increaseBibleFontSize(current);
                      writeBibleTypography(next);
                      return next;
                    })
                  }
                  disabled={typography.fontSize >= BIBLE_FONT_SIZE_MAX}
                  aria-label="Perbesar teks"
                >
                  A+
                </button>
              </div>
              <label className="chapter-scrubber">
                <span>Pasal cepat</span>
                <input
                  type="range"
                  min="1"
                  max={book.chapters}
                  value={chapter}
                  onChange={(event) =>
                    setSelectedChapter(Number(event.target.value))
                  }
                />
                <output>{chapter}</output>
              </label>
            </div>
            <div
              className={`reader-action-group${readerActionsOpen ? " is-open" : ""}`}
            >
              {assetCatalogReady && bibleVersionOptions.length === 1 && (
                <Link
                  className="quiet-button reader-control reader-control-icon reader-secondary-action"
                  to="/lainnya?section=data"
                  aria-label="Unduh versi Alkitab lain"
                  title="Unduh versi lain"
                >
                  <Icon name="download" size={17} />
                </Link>
              )}
              <button
                className="quiet-button reader-control reader-control-icon reader-secondary-action"
                type="button"
                onClick={() => setSplitView((value) => !value)}
                aria-pressed={splitView}
                aria-label={
                  splitView ? "Tampilkan satu kolom" : "Tampilkan dua kolom"
                }
                title={splitView ? "Satu kolom" : "Dua kolom"}
              >
                <Icon name="columns" size={17} />
                <span className="control-copy">
                  {splitView ? "Satu kolom" : "Dua kolom"}
                </span>
              </button>
              {splitView && (
                <button
                  className={`quiet-button reader-control reader-control-sync reader-secondary-action${syncScroll ? " is-active" : ""}`}
                  type="button"
                  onClick={toggleSyncScroll}
                  aria-pressed={syncScroll}
                  aria-label={syncScroll ? "Gulir sinkron" : "Gulir mandiri"}
                  title={syncScroll ? "Gulir: Sinkron" : "Gulir: Mandiri"}
                >
                  <Icon name="arrow" size={17} />
                  <span className="sr-only">
                    {syncScroll ? "Gulir: Sinkron" : "Gulir: Mandiri"}
                  </span>
                </button>
              )}
              <button
                className="quiet-button reader-control reader-control-icon reader-secondary-action"
                type="button"
                onClick={() => void copyChapter()}
                aria-label={copied ? "Ayat tersalin" : "Salin pasal"}
                title={copied ? "Ayat tersalin" : "Salin pasal"}
              >
                <Icon name="copy" size={17} />
                <span className="control-copy">
                  {copied
                    ? translate(locale, "bible.copied")
                    : translate(locale, "bible.copy")}
                </span>
              </button>
              <button
                className="quiet-button reader-control reader-control-icon"
                type="button"
                onClick={() => {
                  if (speechSnapshot.status === "speaking") {
                    void speechPlayer.pause();
                  } else if (speechSnapshot.status === "paused") {
                    void speechPlayer.resume();
                  } else if (speaking) {
                    void speechPlayer.stop();
                    setSpeaking(false);
                  } else speakChapter();
                }}
                disabled={!speechAvailable}
                aria-label={
                  speechSnapshot.status === "paused"
                    ? "Lanjutkan bacaan"
                    : speechSnapshot.status === "speaking"
                      ? "Jeda bacaan"
                      : speaking
                        ? translate(locale, "bible.stopReading")
                        : translate(locale, "bible.readAloud")
                }
                title={
                  speechSnapshot.status === "paused"
                    ? "Lanjutkan bacaan"
                    : speechSnapshot.status === "speaking"
                      ? "Jeda bacaan"
                      : speaking
                        ? translate(locale, "bible.stopReading")
                        : translate(locale, "bible.readAloud")
                }
              >
                <Icon
                  name={
                    speechSnapshot.status === "speaking"
                      ? "pause"
                      : speechSnapshot.status === "paused"
                        ? "play"
                        : speaking
                          ? "stop"
                          : "play"
                  }
                  size={17}
                />
                <span className="control-copy">
                  {speechSnapshot.status === "paused"
                    ? "Lanjutkan bacaan"
                    : speechSnapshot.status === "speaking"
                      ? "Jeda bacaan"
                      : speaking
                        ? translate(locale, "bible.stopReading")
                        : translate(locale, "bible.readAloud")}
                </span>
              </button>
              <button
                className="quiet-button reader-control reader-control-icon speech-settings-toggle reader-secondary-action"
                type="button"
                aria-expanded={speechControlsOpen}
                onClick={() => setSpeechControlsOpen((current) => !current)}
                aria-label={
                  speechControlsOpen
                    ? "Tutup pengaturan suara"
                    : "Pengaturan suara"
                }
                title={speechControlsOpen ? "Tutup suara" : "Pengaturan suara"}
              >
                <Icon name="settings" size={17} />
                <span className="control-copy">
                  {speechControlsOpen ? "Tutup suara" : "Pengaturan suara"}
                </span>
              </button>
              <button
                className="quiet-button reader-control reader-control-icon reader-overflow-toggle"
                type="button"
                aria-expanded={readerActionsOpen}
                aria-label={
                  readerActionsOpen ? "Ringkas kontrol" : "Tampilkan kontrol"
                }
                title={readerActionsOpen ? "Ringkas kontrol" : "Kontrol lain"}
                onClick={() => setReaderActionsOpen((current) => !current)}
              >
                <Icon
                  name={readerActionsOpen ? "chevronDown" : "more"}
                  size={17}
                />
              </button>
            </div>
            <div
              className={`speech-controls${speechControlsOpen ? " is-open" : ""}`}
              aria-label="Pengaturan bacaan suara"
            >
              <label>
                <span>Mesin</span>
                <select
                  value={speechSnapshot.engine}
                  onChange={(event) =>
                    speechPlayer.setEngine(
                      SpeechEnginePreferenceSchema.parse(event.target.value),
                    )
                  }
                >
                  <option value="edge">Edge TTS</option>
                  <option value="local">TTS lokal</option>
                </select>
              </label>
              <label>
                <span>Suara</span>
                <select
                  value={
                    availableSpeechVoices.some(
                      (voice) => voice.id === speechSnapshot.voiceId,
                    )
                      ? speechSnapshot.voiceId
                      : ""
                  }
                  onChange={(event) =>
                    speechPlayer.setVoice(event.target.value)
                  }
                  disabled={availableSpeechVoices.length === 0}
                >
                  <option value="">Otomatis</option>
                  {availableSpeechVoices.map((voice) => (
                    <option value={voice.id} key={voice.id}>
                      {voice.name} · {voice.language}
                      {voice.local ? " · lokal" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Kecepatan {speechSnapshot.rate.toFixed(1)}×</span>
                <input
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechSnapshot.rate}
                  onChange={(event) =>
                    speechPlayer.setRate(Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Nada {speechSnapshot.pitch.toFixed(1)}×</span>
                <input
                  aria-label="Nada bacaan suara"
                  type="range"
                  min="0.5"
                  max="2"
                  step="0.1"
                  value={speechSnapshot.pitch}
                  onChange={(event) =>
                    speechPlayer.setPitch(Number(event.target.value))
                  }
                />
              </label>
              <label>
                <span>Volume {Math.round(speechSnapshot.volume * 100)}%</span>
                <input
                  aria-label="Volume bacaan suara"
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={speechSnapshot.volume}
                  onChange={(event) =>
                    speechPlayer.setVolume(Number(event.target.value))
                  }
                />
              </label>
            </div>
          </div>
          {splitView && (
            <div className="split-controls-row">
              <label className="split-ratio-control">
                <span>Lebar bacaan</span>
                <input
                  type="range"
                  min="42"
                  max="72"
                  value={splitRatio}
                  onChange={(event) =>
                    setSplitRatio(Number(event.target.value))
                  }
                />
                <output>{splitRatio}%</output>
              </label>
              <label className="split-sync-toggle">
                <input
                  type="checkbox"
                  checked={syncScroll}
                  onChange={(event) => setSyncScroll(event.target.checked)}
                />
                <span>Gulir serentak</span>
              </label>
            </div>
          )}
          <div
            className="bible-reader-layout"
            ref={splitLayoutRef}
            style={splitStyle}
          >
            <ChapterPane
              book={book}
              chapter={chapter}
              verses={chapterVerses}
              translation={packState.pack.translation}
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
                aria-label="Atur lebar kolom bacaan"
                aria-orientation="vertical"
                aria-valuemin={42}
                aria-valuemax={72}
                aria-valuenow={splitRatio}
                tabIndex={0}
                onPointerDown={startSplitDrag}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft")
                    setSplitRatio((value) => Math.max(42, value - 2));
                  if (event.key === "ArrowRight")
                    setSplitRatio((value) => Math.min(72, value + 2));
                }}
              >
                <span aria-hidden="true" />
              </div>
            )}
            {splitView && nextTarget && (
              <ChapterPane
                book={nextTarget.book}
                chapter={nextTarget.chapter}
                verses={nextVerses}
                translation={packState.pack.translation}
                bookmarks={bookmarks}
                highlights={highlights}
                selectedVerseId={selectedVerseId}
                speakingVerseId={speakingVerseId}
                searchQuery={query}
                secondary
                scrollRef={secondaryScrollRef}
                onScroll={onSecondaryScroll}
                onSelect={selectVerse}
                onBookmark={toggleBookmark}
              />
            )}
            {splitView && !nextTarget && (
              <div className="bible-pane-secondary bible-side-empty">
                Ini adalah bacaan terakhir dalam paket{" "}
                {packState.pack.translation}.
              </div>
            )}
          </div>
          <div className="reader-pagination">
            <button
              className="quiet-button"
              type="button"
              onClick={() => navigateBy(-1)}
              disabled={!findNextTarget(books, book, chapter, -1)}
            >
              ← Sebelumnya
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
              Berikutnya →
            </button>
          </div>
        </section>
      )}
      {packState.status === "ready" && renderSidePanel()}
      {packState.status === "ready" && book && (
        <BiblePickerModal
          open={pickerModalOpen}
          onClose={() => setPickerModalOpen(false)}
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
        />
      )}
      {selectedVerse &&
        book &&
        createPortal(
          <div
            className="selected-verse-toolbar"
            data-testid="selected-verse-toolbar"
            role="toolbar"
            aria-label="Aksi ayat terpilih"
          >
            <div className="selected-verse-context">
              <strong>
                {book.name} {chapter}:{selectedVerse.verse}
              </strong>
              <span>{cleanVerse(selectedVerse)}</span>
            </div>
            <div className="selected-verse-actions">
              <button
                className="quiet-button"
                type="button"
                onClick={() => void copySelected()}
              >
                Salin
              </button>
              <button
                className="quiet-button"
                type="button"
                onClick={() => void shareSelected()}
              >
                Bagikan
              </button>
              <button
                className="quiet-button"
                type="button"
                disabled={!speechAvailable}
                onClick={() => speakVerses([selectedVerse])}
              >
                Baca ayat
              </button>
              <div
                className="selected-verse-highlights"
                aria-label="Warna sorotan"
              >
                {(["yellow", "blue", "green"] as const).map((color) => (
                  <button
                    className={`highlight-dot is-${color}${highlights[selectedVerse.id] === color ? " is-active" : ""}`}
                    key={color}
                    type="button"
                    aria-label={`Sorot ${color}`}
                    aria-pressed={highlights[selectedVerse.id] === color}
                    onClick={() =>
                      setHighlights((current) => ({
                        ...current,
                        [selectedVerse.id]: color,
                      }))
                    }
                  />
                ))}
              </div>
              <button
                className="quiet-button"
                type="button"
                onClick={focusSelectedVerseNote}
              >
                Catatan
              </button>
              <button
                className="selected-verse-close"
                type="button"
                aria-label="Tutup ayat terpilih"
                onClick={() => setSelectedVerseId(undefined)}
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
          aria-label="Tindakan teks terpilih"
          style={{ left: selectionToolbar.left, top: selectionToolbar.top }}
          onMouseDown={(event) => event.preventDefault()}
        >
          <button type="button" onClick={() => void copySelection()}>
            Salin
          </button>
          <button type="button" onClick={() => void shareSelection()}>
            Bagikan
          </button>
          {selectionToolbar.verseId && (
            <button type="button" onClick={noteSelection}>
              Catat
            </button>
          )}
          <button
            type="button"
            aria-label="Tutup tindakan teks"
            onClick={() => {
              window.getSelection()?.removeAllRanges();
              setSelectionToolbar(undefined);
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
