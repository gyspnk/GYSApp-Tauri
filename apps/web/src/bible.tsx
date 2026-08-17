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
import {
  BibleReaderPackSchema,
  SpeechEnginePreferenceSchema,
  type BibleBook,
  type BibleReaderPack,
} from "@gys/contracts";
import { sanitizeBibleText, type BibleVerse } from "@gys/domain";
import { useSearchParams } from "react-router-dom";
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
import { useReadingToolbarAutoHide } from "./use-toolbar-auto-hide.js";
import {
  BiblePickerModal,
  BibleQuickNavOverlay,
  resolveDragColumn,
  scrubBookIndex,
  scrubChapterNumber,
  scrubVerseNumber,
  type QuickNavDragState,
} from "./bible-quick-nav.js";

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

function readSavedNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const saved = Number(localStorage.getItem(key));
  return Number.isInteger(saved) && saved > 0 ? saved : fallback;
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
  onQuickNavPointerDown,
  onQuickNavKeyDown,
  onHeadingClick,
}: {
  book: BibleBook;
  chapter: number;
  verses: BibleVerse[];
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
  onQuickNavPointerDown?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onQuickNavKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
  onHeadingClick?: () => void;
}) {
  return (
    <section
      className={`bible-pane${secondary ? " bible-pane-secondary" : ""}`}
      aria-label={`${book.name} ${chapter}`}
    >
      <div
        className={`reader-heading${onQuickNavPointerDown ? " quick-nav-handle" : ""}`}
        onPointerDown={onQuickNavPointerDown}
        onClick={onHeadingClick}
        onKeyDown={onQuickNavKeyDown}
        role={onQuickNavPointerDown ? "button" : undefined}
        tabIndex={onQuickNavPointerDown ? 0 : undefined}
        aria-label={
          onQuickNavPointerDown
            ? "Geser judul untuk berpindah pasal"
            : undefined
        }
      >
        <div>
          <p className="date-line">Terjemahan Baru</p>
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
  const [searchResults, setSearchResults] = useState<BibleVerse[]>([]);
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
  const [copied, setCopied] = useState(false);
  const { toolbarVisible, restoreToolbar } = useReadingToolbarAutoHide();
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
        initialBookIndex: number;
        initialChapter: number;
        initialVerse: number;
        currentBookId: number;
        currentChapter: number;
        currentVerse: number;
      }
    | undefined
  >(undefined);
  const [typography, setTypography] = useState<BibleTypography>(() =>
    readBibleTypography(),
  );
  useEffect(
    () => subscribeBibleTypography(() => setTypography(readBibleTypography())),
    [],
  );

  const startQuickNav = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const bookId = book?.id ?? selectedBook;
    const bookIdx = Math.max(
      0,
      books.findIndex((b) => b.id === bookId),
    );
    quickNavRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: Date.now(),
      hasDragged: false,
      initialBookIndex: bookIdx,
      initialChapter: chapter,
      initialVerse: 1,
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
    void fetch(`${import.meta.env.BASE_URL}offline/bible/tb-reader.json`, {
      signal: controller.signal,
      cache: "force-cache",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Offline TB reader pack unavailable");
        const json: unknown = await response.json();
        const parsed = BibleReaderPackSchema.safeParse(json);
        if (!parsed.success) throw new Error("TB reader pack is invalid");
        setPackState({ status: "ready", pack: parsed.data });
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
  }, []);

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
      const col = resolveDragColumn(event.clientX, window.innerWidth);
      let nextBookId = active.currentBookId;
      let nextChapter = active.currentChapter;
      let nextVerse = active.currentVerse;

      if (col === "book") {
        const targetIdx = scrubBookIndex(
          active.initialBookIndex,
          dy,
          books.length,
          24,
        );
        const targetBook = books[targetIdx] ?? books[0];
        if (targetBook) {
          nextBookId = targetBook.id;
          nextChapter = Math.min(active.initialChapter, targetBook.chapters);
          nextVerse = 1;
        }
      } else if (col === "chapter") {
        const currentB =
          books.find((b) => b.id === active.currentBookId) ?? book;
        if (currentB) {
          nextChapter = scrubChapterNumber(
            active.initialChapter,
            dy,
            currentB.chapters,
            48,
          );
          nextVerse = 1;
        }
      } else if (col === "verse") {
        const currentB =
          books.find((b) => b.id === active.currentBookId) ?? book;
        const totalV =
          packState.status === "ready"
            ? packState.pack.verses.filter(
                (v) =>
                  v.book === String(currentB?.id) && v.chapter === nextChapter,
              ).length
            : 30;
        nextVerse = scrubVerseNumber(active.initialVerse, dy, totalV || 30, 28);
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
        activeColumn: col,
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
        if (active.currentVerse > 1) {
          setSelectedVerseId(
            `${active.currentBookId}:${active.currentChapter}:${active.currentVerse}`,
          );
        }
        quickNavRef.current = undefined;
        window.setTimeout(() => setQuickNavDrag(undefined), 120);
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
          title: "Alkitab Terjemahan Baru",
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
          <div className="selection-actions">
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
          </div>
          <div className="highlight-actions" aria-label="Warna sorotan">
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
            <button
              className="text-button"
              type="button"
              onClick={() =>
                setHighlights((current) => {
                  const next = { ...current };
                  delete next[selectedVerse.id];
                  return next;
                })
              }
            >
              Hapus sorotan
            </button>
          </div>
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
      <section className="page-intro">
        <div>
          <p className="date-line">TB · offline reader</p>
          <h1>{translate(locale, "page.bibleTitle")}</h1>
          <p className="intro-copy">{translate(locale, "page.bibleBody")}</p>
        </div>

        <div className="page-intro-actions">
          <span className="pack-badge">TB · 66 buku</span>
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
            <output aria-live="polite">{typography.fontSize} px</output>
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
        </div>
      </section>

      <form
        className="bible-search"
        onSubmit={(event) => void runSearch(event)}
        role="search"
      >
        <label htmlFor="bible-query">{translate(locale, "bible.search")}</label>
        <div className="search-row">
          <input
            id="bible-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={translate(locale, "bible.searchPlaceholder")}
          />
          <button className="primary-button" type="submit" disabled={searching}>
            {searching ? "…" : translate(locale, "bible.searchAction")}
          </button>
        </div>
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
          <div className="bible-search-history" aria-label="Pencarian terakhir">
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
              onClick={() => setSearchResults([])}
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

      {packState.status === "loading" && (
        <div className="loading-panel" role="status">
          {translate(locale, "bible.loading")}
        </div>
      )}
      {packState.status === "error" && (
        <div className="error-panel" role="alert">
          <strong>{translate(locale, "bible.offlineError")}</strong>
          <span>{packState.message}</span>
        </div>
      )}

      {packState.status === "ready" && book && (
        <section
          className={`bible-reader${splitView ? " is-split" : ""}`}
          aria-label={translate(locale, "page.bibleTitle")}
          onClick={restoreToolbar}
        >
          {quickNavDrag && (
            <BibleQuickNavOverlay books={books} dragState={quickNavDrag} />
          )}
          <div
            className={`reader-toolbar${toolbarVisible ? "" : " is-collapsed"}`}
          >
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
              options={Array.from({ length: book.chapters }, (_, index) => ({
                value: index + 1,
                label: String(index + 1),
              }))}
            />
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
            <span className="reader-spacer" />
            <button
              className="quiet-button"
              type="button"
              onClick={() => setSplitView((value) => !value)}
              aria-pressed={splitView}
            >
              {splitView ? "Satu kolom" : "Dua kolom"}
            </button>
            {splitView && (
              <button
                className={`quiet-button${syncScroll ? " is-active" : ""}`}
                type="button"
                onClick={toggleSyncScroll}
                aria-pressed={syncScroll}
              >
                {syncScroll ? "Gulir: Sinkron" : "Gulir: Mandiri"}
              </button>
            )}
            <button
              className="quiet-button"
              type="button"
              onClick={() => void copyChapter()}
            >
              {copied
                ? translate(locale, "bible.copied")
                : translate(locale, "bible.copy")}
            </button>
            <button
              className="quiet-button"
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
            >
              {speechSnapshot.status === "paused"
                ? "Lanjutkan bacaan"
                : speechSnapshot.status === "speaking"
                  ? "Jeda bacaan"
                  : speaking
                    ? translate(locale, "bible.stopReading")
                    : translate(locale, "bible.readAloud")}
            </button>
            <div
              className="speech-controls"
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
                  <option value="auto">Edge → lokal</option>
                  <option value="edge">Edge online</option>
                  <option value="local">Suara perangkat</option>
                </select>
              </label>
              <label>
                <span>Suara</span>
                <select
                  value={speechSnapshot.voiceId ?? ""}
                  onChange={(event) =>
                    speechPlayer.setVoice(event.target.value)
                  }
                  disabled={speechSnapshot.voices.length === 0}
                >
                  <option value="">Otomatis</option>
                  {speechSnapshot.voices.map((voice) => (
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
              onQuickNavPointerDown={startQuickNav}
              onQuickNavKeyDown={quickNavKeyDown}
              onHeadingClick={() => {
                if (!quickNavRef.current?.hasDragged) {
                  setPickerModalOpen(true);
                }
              }}
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
                Ini adalah bacaan terakhir dalam paket TB.
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
