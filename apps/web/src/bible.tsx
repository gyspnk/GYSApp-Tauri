import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  type TouchEvent,
} from "react";
import {
  BibleReaderPackSchema,
  type BibleBook,
  type BibleReaderPack,
} from "@gys/contracts";
import {
  BibleRepository,
  sanitizeBibleText,
  type BibleVerse,
} from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import { Select } from "./select.js";
import { setBibleActivity } from "./history.js";

type PackState =
  | { status: "loading" }
  | { status: "ready"; pack: BibleReaderPack }
  | { status: "error"; message: string };

const BOOK_KEY = "gys-bible-book";
const CHAPTER_KEY = "gys-bible-chapter";
const BOOKMARKS_KEY = "gys-bible-bookmarks";
const NOTES_KEY = "gys-bible-notes-v1";
const HIGHLIGHTS_KEY = "gys-bible-highlights-v1";
const SEARCH_HISTORY_KEY = "gys-bible-search-history-v1";
const SPLIT_KEY = "gys-bible-split-v1";
const SPLIT_RATIO_KEY = "gys-bible-split-ratio-v1";

function readSavedNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const saved = Number(localStorage.getItem(key));
  return Number.isInteger(saved) && saved > 0 ? saved : fallback;
}

function readBoolean(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) === "1";
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
  searchQuery,
  secondary = false,
  onSelect,
  onBookmark,
  onTouchStart,
  onTouchEnd,
}: {
  book: BibleBook;
  chapter: number;
  verses: BibleVerse[];
  bookmarks: Set<string>;
  highlights: Record<string, string>;
  selectedVerseId?: string | undefined;
  searchQuery: string;
  secondary?: boolean;
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
          <p className="date-line">Terjemahan Baru</p>
          <h2>
            {book.name} {chapter}
          </h2>
        </div>
        <span>{verses.length} ayat</span>
      </div>
      <div
        className="verse-list"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {verses.map((verse) => {
          const selected = selectedVerseId === verse.id;
          const highlight = highlights[verse.id];
          return (
            <article
              className={`verse-row${selected ? " is-selected" : ""}${
                highlight ? ` is-highlight-${highlight}` : ""
              }`}
              id={`bible-verse-${verse.id}`}
              key={verse.id}
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
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function BiblePage({ locale }: { locale: Locale }) {
  const [packState, setPackState] = useState<PackState>({ status: "loading" });
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
  const [splitView, setSplitView] = useState(() =>
    readBoolean(SPLIT_KEY, false),
  );
  const [splitRatio, setSplitRatio] = useState(() => {
    if (typeof window === "undefined") return 58;
    const value = Number(localStorage.getItem(SPLIT_RATIO_KEY));
    return Number.isFinite(value) && value >= 42 && value <= 72 ? value : 58;
  });
  const touchStartX = useRef<number | undefined>(undefined);

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

  const repository = useMemo(
    () =>
      packState.status === "ready"
        ? new BibleRepository(packState.pack.verses)
        : undefined,
    [packState],
  );
  const books = packState.status === "ready" ? packState.pack.books : [];
  const book =
    books.find((candidate) => candidate.id === selectedBook) ?? books[0];
  const chapter = Math.min(selectedChapter, book?.chapters ?? selectedChapter);
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
  const speechAvailable =
    typeof window !== "undefined" && "speechSynthesis" in window;

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
    localStorage.setItem(SPLIT_KEY, splitView ? "1" : "0");
  }, [splitView]);
  useEffect(() => {
    localStorage.setItem(SPLIT_RATIO_KEY, String(splitRatio));
  }, [splitRatio]);
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
  useEffect(() => () => window.speechSynthesis?.cancel(), []);

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
    if (!repository || !requestedQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setSearching(true);
    try {
      const results = await repository.search(requestedQuery, {
        ...(searchBook === "all" ? {} : { book: searchBook }),
        exactPhrase,
        wholeWord,
      });
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
    } finally {
      setSearching(false);
    }
  };

  const toggleBookmark = (id: string) => {
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

  const speakChapter = () => {
    if (!chapterVerses.length || !speechAvailable) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(
      chapterVerses
        .map((verse) => `${verse.verse}. ${cleanVerse(verse)}`)
        .join(" "),
    );
    utterance.lang =
      locale === "zh" ? "zh-CN" : locale === "en" ? "en-US" : "id-ID";
    utterance.rate = 0.9;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
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
  } as CSSProperties & { "--bible-split": string };

  return (
    <div className="page bible-page">
      <section className="page-intro">
        <div>
          <p className="date-line">TB · offline reader</p>
          <h1>{translate(locale, "page.bibleTitle")}</h1>
          <p className="intro-copy">{translate(locale, "page.bibleBody")}</p>
        </div>
        <span className="pack-badge">TB · 66 buku</span>
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
        >
          <div className="reader-toolbar">
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
                if (speaking) {
                  window.speechSynthesis.cancel();
                  setSpeaking(false);
                } else speakChapter();
              }}
              disabled={!speechAvailable}
            >
              {speaking
                ? translate(locale, "bible.stopReading")
                : translate(locale, "bible.readAloud")}
            </button>
          </div>
          {splitView && (
            <label className="split-ratio-control">
              <span>Lebar bacaan</span>
              <input
                type="range"
                min="42"
                max="72"
                value={splitRatio}
                onChange={(event) => setSplitRatio(Number(event.target.value))}
              />
              <output>{splitRatio}%</output>
            </label>
          )}
          <div className="bible-reader-layout" style={splitStyle}>
            <ChapterPane
              book={book}
              chapter={chapter}
              verses={chapterVerses}
              bookmarks={bookmarks}
              highlights={highlights}
              selectedVerseId={selectedVerseId}
              searchQuery={query}
              onSelect={selectVerse}
              onBookmark={toggleBookmark}
              onTouchStart={onVerseTouchStart}
              onTouchEnd={onVerseTouchEnd}
            />
            {splitView && nextTarget && (
              <ChapterPane
                book={nextTarget.book}
                chapter={nextTarget.chapter}
                verses={nextVerses}
                bookmarks={bookmarks}
                highlights={highlights}
                selectedVerseId={selectedVerseId}
                searchQuery={query}
                secondary
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
    </div>
  );
}
