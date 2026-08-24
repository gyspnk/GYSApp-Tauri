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
  type BibleCrossReference,
  type BiblePericope,
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
import { Icon } from "./icons.js";
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

function decodeBibleEntityLocal(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    nbsp: " ",
    quot: '"',
    lt: "<",
    gt: ">",
  };
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi,
    (whole, decimal: string, hexadecimal: string, name: string) => {
      const codePoint = decimal
        ? Number(decimal)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : undefined;
      if (
        codePoint !== undefined &&
        Number.isInteger(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff
      )
        return String.fromCodePoint(codePoint);
      return name ? (named[name.toLowerCase()] ?? whole) : whole;
    },
  );
}

type VerseSegment = {
  text: string;
  isJesus?: boolean;
  isFootnote?: boolean;
  isItalic?: boolean;
  isPoetry?: boolean;
};

function parseBibleVerseSegments(raw: string): VerseSegment[] {
  const segments: VerseSegment[] = [];
  const stack: Array<
    Pick<VerseSegment, "isJesus" | "isFootnote" | "isItalic" | "isPoetry">
  > = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const style = stack.reduce(
      (acc, cur) => ({ ...acc, ...cur }),
      {} as Pick<
        VerseSegment,
        "isJesus" | "isFootnote" | "isItalic" | "isPoetry"
      >,
    );
    // footnote ⓐⓑ hidden completely — jangan push sama sekali
    if (style.isFootnote) {
      buffer = "";
      return;
    }
    const decoded = decodeBibleEntityLocal(buffer);
    segments.push({ text: decoded, ...style });
    buffer = "";
  };
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "<") {
      const end = raw.indexOf(">", i);
      if (end === -1) {
        buffer += raw[i];
        i += 1;
        continue;
      }
      const tagRaw = raw.slice(i + 1, end).trim();
      const isClosing = tagRaw.startsWith("/");
      const tagName = tagRaw
        .replace(/^\//, "")
        .split(/[\s\/]/, 1)[0]
        ?.toLowerCase();
      const isSelfClosing = tagRaw.endsWith("/") || tagName === "pb";
      flush();
      if (!isClosing && !isSelfClosing) {
        if (tagName === "j") stack.push({ isJesus: true });
        else if (tagName === "f") stack.push({ isFootnote: true });
        else if (tagName === "i") stack.push({ isItalic: true });
        else if (tagName === "t") stack.push({ isPoetry: true });
        else if (tagName === "br" || tagName === "p") {
          segments.push({ text: "\n" });
        }
      } else if (isClosing) {
        for (let s = stack.length - 1; s >= 0; s -= 1) {
          const cur = stack[s];
          if (!cur) continue;
          if (
            (tagName === "j" && cur.isJesus) ||
            (tagName === "f" && cur.isFootnote) ||
            (tagName === "i" && cur.isItalic) ||
            (tagName === "t" && cur.isPoetry)
          ) {
            stack.splice(s, 1);
            break;
          }
        }
        if (tagName === "t") {
          segments.push({ text: "\n" });
        }
      } else if (isSelfClosing) {
        if (tagName === "pb") segments.push({ text: "\n" });
        else if (tagName === "br") segments.push({ text: "\n" });
      }
      i = end + 1;
      continue;
    }
    if (raw[i] === "&") {
      const semi = raw.indexOf(";", i);
      if (semi !== -1 && semi - i <= 32) {
        buffer += raw.slice(i, semi + 1);
        i = semi + 1;
        continue;
      }
    }
    buffer += raw[i];
    i += 1;
  }
  flush();
  // Merge consecutive segments with same style and normalize spaces
  const merged: VerseSegment[] = [];
  for (const seg of segments) {
    if (seg.text === "\n") {
      merged.push(seg);
      continue;
    }
    const normalized = seg.text.replace(/\s+/g, " ");
    if (!normalized.trim()) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      last.text !== "\n" &&
      last.isJesus === seg.isJesus &&
      last.isFootnote === seg.isFootnote &&
      last.isItalic === seg.isItalic &&
      last.isPoetry === seg.isPoetry
    ) {
      last.text += normalized;
    } else {
      merged.push({ ...seg, text: normalized });
    }
  }
  // hapus <br> di awal/akhir yang bikin first line ter-enter sekali, dan rapikan dobel enter
  while (merged.length && merged[0]?.text === "\n") merged.shift();
  while (merged.length && merged[merged.length - 1]?.text === "\n")
    merged.pop();
  const compact: VerseSegment[] = [];
  for (const seg of merged) {
    if (seg.text === "\n" && compact[compact.length - 1]?.text === "\n")
      continue;
    compact.push(seg);
  }
  return compact;
}

function highlightSegmentText(text: string, query: string): React.ReactNode[] {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!terms.length) return [text];
  const matcher = new RegExp(`(${terms.join("|")})`, "ig");
  return text
    .split(matcher)
    .map((part, idx) =>
      terms.some((term) => new RegExp(`^${term}$`, "i").test(part)) ? (
        <mark key={`${part}-${idx}`}>{part}</mark>
      ) : (
        <span key={`${part}-${idx}`}>{part}</span>
      ),
    );
}

function BibleVerseText({ raw, query }: { raw: string; query: string }) {
  const segments = parseBibleVerseSegments(raw);
  if (!segments.length) return null;
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.text === "\n") return <br key={`br-${idx}`} />;
        if (seg.isFootnote) return null;
        const highlighted = highlightSegmentText(seg.text, query);
        // footnote ⓐⓑ hidden per request — gak tampak sama sekali
        if (seg.isJesus) {
          return (
            <span key={`seg-${idx}`} className="bible-jw">
              {highlighted}
            </span>
          );
        }
        if (seg.isPoetry) {
          return (
            <span key={`seg-${idx}`} className="bible-poetry">
              {highlighted}
            </span>
          );
        }
        if (seg.isItalic) {
          return (
            <em key={`seg-${idx}`} className="bible-italic">
              {highlighted}
            </em>
          );
        }
        return <span key={`seg-${idx}`}>{highlighted}</span>;
      })}
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

const EMPTY_BOOKMARKS = new Set<string>();
const EMPTY_HIGHLIGHTS: Record<string, string> = {};

function ChapterPane({
  book,
  chapter,
  verses,
  translation,
  pericopes,
  crossRefs,
  onOpenCrossRefs,
  onSelectParallel,
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
  pericopes?: readonly BiblePericope[] | undefined;
  crossRefs?:
    Readonly<Record<string, readonly BibleCrossReference[]>> | undefined;
  onOpenCrossRefs?: (
    id: string,
    refs: readonly BibleCrossReference[],
    title: string,
  ) => void;
  onSelectParallel?: (bookId: number, chapter: number, verse: number) => void;
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
  const chapterPericopes = useMemo(() => {
    if (!pericopes?.length) return [];
    return pericopes.filter(
      (p) => p.book === String(book.id) && p.chapter === chapter,
    );
  }, [pericopes, book.id, chapter]);

  const pericopeByVerse = useMemo(() => {
    const map = new Map<number, BiblePericope>();
    for (const p of chapterPericopes) {
      map.set(p.verse, p);
    }
    return map;
  }, [chapterPericopes]);

  return (
    <section
      className={`bible-pane${secondary ? " bible-pane-secondary" : ""}`}
      aria-label={`${book.name} ${chapter}`}
      data-pericopes={pericopes?.length ?? 0}
      data-book={book.id}
      data-chapter={chapter}
    >
      <div className="reader-heading">
        <p className="date-line">{translation}</p>
        <h2>
          {book.name} {chapter}
        </h2>
        <span>{verses.length} ayat</span>
      </div>
      {(() => {
        const chapterPericope = pericopeByVerse.get(0);
        if (!chapterPericope) return null;
        return (
          <div
            className="bible-pericope-heading is-chapter"
            role="heading"
            aria-level={3}
          >
            <div className="bible-pericope-title-row">
              <span className="bible-pericope-title">
                {chapterPericope.title}
              </span>
            </div>
            {chapterPericope.parallels &&
              chapterPericope.parallels.length > 0 && (
                <div className="bible-pericope-parallels">
                  {chapterPericope.parallels.map((par, i) => (
                    <button
                      key={i}
                      type="button"
                      className="bible-parallel-pill"
                      onClick={() => {
                        if (par.start) {
                          onSelectParallel?.(
                            Number(par.start.book),
                            par.start.chapter,
                            par.start.verse,
                          );
                        }
                      }}
                      title={`Buka paralel ${par.text}`}
                    >
                      {par.text}
                    </button>
                  ))}
                </div>
              )}
          </div>
        );
      })()}
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
          const pericope =
            verse.verse === 0 ? undefined : pericopeByVerse.get(verse.verse);

          const numericId = String(
            book.id * 1_000_000 + chapter * 1000 + verse.verse,
          );
          const verseRefs =
            crossRefs?.[verse.id] ??
            crossRefs?.[`${book.id}:${chapter}:${verse.verse}`] ??
            crossRefs?.[numericId];
          const hasVerseRefs = Boolean(verseRefs && verseRefs.length);

          return (
            <div key={verse.id}>
              {pericope && (
                <div
                  className="bible-pericope-heading"
                  role="heading"
                  aria-level={3}
                >
                  <div className="bible-pericope-title-row">
                    <span className="bible-pericope-title">
                      {pericope.title}
                    </span>
                  </div>
                  {pericope.parallels && pericope.parallels.length > 0 && (
                    <div className="bible-pericope-parallels">
                      {pericope.parallels.map((par, i) => (
                        <button
                          key={i}
                          type="button"
                          className="bible-parallel-pill"
                          onClick={() => {
                            if (par.start) {
                              onSelectParallel?.(
                                Number(par.start.book),
                                par.start.chapter,
                                par.start.verse,
                              );
                            }
                          }}
                          title={`Buka paralel ${par.text}`}
                        >
                          {par.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <article
                className={`verse-row${selected ? " is-selected" : ""}${speaking ? " is-speaking" : ""}${highlight ? ` is-highlight-${highlight}` : ""}`}
                id={`bible-verse-${verse.id}`}
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
                <div className="verse-content">
                  <span
                    className="verse-text"
                    role="button"
                    tabIndex={0}
                    onClick={() => onSelect(verse)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(verse);
                      }
                    }}
                    aria-pressed={selected}
                  >
                    <BibleVerseText raw={verse.text} query={searchQuery} />
                  </span>
                  {hasVerseRefs && onOpenCrossRefs && verseRefs && (
                    <button
                      className="bible-crossref-inline"
                      type="button"
                      aria-label={`Lihat ${verseRefs.length} rujukan silang untuk ${book.name} ${chapter}:${verse.verse}`}
                      title={`${verseRefs.length} rujukan silang`}
                      onClick={() =>
                        onOpenCrossRefs(
                          verse.id,
                          verseRefs,
                          `${book.name} ${chapter}:${verse.verse}`,
                        )
                      }
                    >
                      <span className="bible-crossref-star">*</span>
                      <span className="bible-crossref-count">
                        {verseRefs.length}
                      </span>
                    </button>
                  )}
                </div>
                {speaking && (
                  <span className="sr-only" role="status">
                    Sedang dibacakan: ayat {verse.verse}
                  </span>
                )}
              </article>
            </div>
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
  const [secondaryVersionCode, setSecondaryVersionCode] = useState(() => {
    if (typeof window === "undefined") return "b_tb";
    return localStorage.getItem("gys-bible-secondary-version") ?? "b_tb";
  });
  const [secondaryPackState, setSecondaryPackState] = useState<PackState>({
    status: "loading",
  });
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
            cache: "no-store",
          }).then(async (response) => {
            if (!response.ok)
              throw new Error("Offline TB reader pack unavailable");
            const json: unknown = await response.json();
            const parsed = BibleReaderPackSchema.safeParse(json);
            if (!parsed.success) {
              throw new Error("TB reader pack is invalid");
            }
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
        ? fetch(`${import.meta.env.BASE_URL}offline/bible/tb-reader.json`, {
            signal: controller.signal,
            cache: "no-store",
          }).then(async (response) => {
            if (!response.ok)
              throw new Error("Offline TB reader pack unavailable");
            const json: unknown = await response.json();
            const parsed = BibleReaderPackSchema.safeParse(json);
            if (!parsed.success) throw new Error("TB reader pack is invalid");
            return parsed.data;
          })
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
  ]);

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
        setSearchedQuery("");
        setSelectedVerseId(undefined);
      },
      onOpenPicker: () => {
        if (suppressQuickNavClickRef.current) {
          suppressQuickNavClickRef.current = false;
          return;
        }
        setPickerModalOpen(true);
      },
      startQuickNav,
      quickNavKeyDown,
      fontSize: typography.fontSize,
      minFontSize: BIBLE_FONT_SIZE_MIN,
      maxFontSize: BIBLE_FONT_SIZE_MAX,
      onIncreaseFontSize: () =>
        setTypography((current) => {
          const next = increaseBibleFontSize(current);
          writeBibleTypography(next);
          return next;
        }),
      onDecreaseFontSize: () =>
        setTypography((current) => {
          const next = decreaseBibleFontSize(current);
          writeBibleTypography(next);
          return next;
        }),
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
            );
          }
        }
      },
      copied,
      onCopyChapter: () => void copyChapter(),
      speechControlsOpen,
      onToggleSpeechControls: () =>
        setSpeechControlsOpen((current) => !current),
      onFocusSearch: () => {
        const input = document.querySelector<HTMLInputElement>(
          ".bible-search-row input",
        );
        input?.focus();
        input?.scrollIntoView({ behavior: "smooth", block: "center" });
      },
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
    typography.fontSize,
    splitView,
    syncScroll,
    speechAvailable,
    speaking,
    speechSnapshot.status,
    speechControlsOpen,
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
                aria-label="Atur lebar kolom bacaan"
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
                      Memuat versi kedua…
                    </div>
                  );
                }
                if (secondaryPackState.status === "error") {
                  return (
                    <div className="bible-pane-secondary bible-side-empty">
                      Gagal memuat {secondaryVersionCode}:{" "}
                      {secondaryPackState.message}
                    </div>
                  );
                }
                const secPack = secondaryPackState.pack;
                const secBook =
                  secPack.books.find((b) => b.id === selectedBook) ??
                  secPack.books.find((b) => String(b.id) === String(book.id)) ??
                  book;
                const secVerses = secPack.verses.filter(
                  (v) => v.book === String(secBook.id) && v.chapter === chapter,
                );
                return (
                  <ChapterPane
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
              <BibleQuickNavOverlay books={books} dragState={quickNavDrag} />,
              document.body,
            )}
          {quickNavDrag &&
            createPortal(
              <div
                className="quick-nav-multistep"
                data-step={quickNavDrag.activeColumn}
              >
                <span>
                  Langkah{" "}
                  {quickNavDrag.activeColumn === "book"
                    ? "1/3 · Kitab"
                    : quickNavDrag.activeColumn === "chapter"
                      ? "2/3 · Pasal"
                      : "3/3 · Ayat"}{" "}
                  —{" "}
                  {quickNavDrag.activeColumn === "verse"
                    ? "lepas untuk pilih"
                    : "lepas ke ayat 1 · diam 1 detik untuk lanjut"}
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
      {packState.status === "ready" &&
        book &&
        createPortal(
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
          />,
          document.body,
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
      {crossRefModal &&
        createPortal(
          <div
            className="bible-crossref-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label={`Rujukan untuk ${crossRefModal.title}`}
            onClick={() => setCrossRefModal(undefined)}
          >
            <div
              className="bible-crossref-modal"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="bible-crossref-header">
                <div>
                  <small>Rujukan silang</small>
                  <strong>{crossRefModal.title}</strong>
                </div>
                <button
                  type="button"
                  aria-label="Tutup rujukan"
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
                {crossRefModal.refs.length} ayat terkait — ketuk untuk membuka
              </p>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
