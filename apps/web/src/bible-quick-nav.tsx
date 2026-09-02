import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { BibleBook, BibleVerse } from "@gys/contracts";
import { sanitizeBibleText } from "@gys/domain";
import { hapticTick } from "./haptics.js";
import { translate, type Locale } from "./i18n.js";

export type DragColumn = "book" | "chapter" | "verse";

export type QuickNavDragState = {
  activeColumn: DragColumn;
  bookId: number;
  chapter: number;
  verse: number;
  bookName: string;
  totalChapters: number;
  totalVerses: number;
  isOutside?: boolean;
};

/**
 * Resolves which navigation column (Kitab, Pasal, or Ayat) is active based on horizontal pointer X.
 */
export function resolveDragColumn(
  clientX: number,
  containerWidth = typeof window !== "undefined" ? window.innerWidth : 800,
): DragColumn {
  if (!Number.isFinite(clientX) || containerWidth <= 0) return "chapter";
  const ratio = Math.max(0, Math.min(1, clientX / containerWidth));
  if (ratio < 0.34) return "book";
  if (ratio > 0.66) return "verse";
  return "chapter";
}

/**
 * Scrubs book index (0-indexed, 0..totalBooks-1) based on vertical delta.
 * Moving up (negative deltaY) advances to later books; moving down goes to earlier books.
 */
export function scrubBookIndex(
  startIndex: number,
  deltaY: number,
  totalBooks = 66,
  stepPixels = 24,
): number {
  if (totalBooks <= 0) return 0;
  const step = Math.round(-deltaY / Math.max(1, stepPixels));
  return Math.max(0, Math.min(totalBooks - 1, startIndex + step));
}

/**
 * Scrubs chapter number (1..totalChapters) based on vertical delta.
 * Step size of 48px ensures 96px upward drag increments 2 chapters.
 */
export function scrubChapterNumber(
  startChapter: number,
  deltaY: number,
  totalChapters: number,
  stepPixels = 48,
): number {
  if (totalChapters <= 0) return 1;
  const step = Math.round(-deltaY / Math.max(1, stepPixels));
  return Math.max(1, Math.min(totalChapters, startChapter + step));
}

/**
 * Scrubs verse number (1..totalVerses) based on vertical delta.
 */
export function scrubVerseNumber(
  startVerse: number,
  deltaY: number,
  totalVerses: number,
  stepPixels = 28,
): number {
  if (totalVerses <= 0) return 1;
  const step = Math.round(-deltaY / Math.max(1, stepPixels));
  return Math.max(1, Math.min(totalVerses, startVerse + step));
}

/**
 * Continuous 3-column Drag Navigation Overlay component.
 * Displays real-time 3-column scrubbing preview (Kitab → Pasal → Ayat) with floating badge.
 */
export function BibleQuickNavOverlay({
  books,
  dragState,
}: {
  books: readonly BibleBook[];
  dragState: QuickNavDragState;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active column to keep the selected item in view
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const selectedEl = container.querySelector<HTMLElement>(".is-selected");
    if (selectedEl) {
      selectedEl.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [
    dragState.activeColumn,
    dragState.bookId,
    dragState.chapter,
    dragState.verse,
  ]);

  const columnLabel = useMemo(() => {
    switch (dragState.activeColumn) {
      case "book":
        return "Menggeser Kitab";
      case "chapter":
        return "Menggeser Pasal";
      case "verse":
        return "Menggeser Ayat";
    }
  }, [dragState.activeColumn]);
  const items =
    dragState.activeColumn === "book"
      ? books.map((book) => ({ value: book.id, label: book.name }))
      : Array.from(
          {
            length:
              dragState.activeColumn === "chapter"
                ? dragState.totalChapters
                : Math.max(1, dragState.totalVerses),
          },
          (_, index) => ({ value: index + 1, label: String(index + 1) }),
        );
  const selected = dragState.isOutside
    ? -1
    : dragState.activeColumn === "book"
      ? dragState.bookId
      : dragState.activeColumn === "chapter"
        ? dragState.chapter
        : dragState.verse;
  const availableRows = Math.max(
    4,
    Math.floor(
      ((typeof window === "undefined" ? 800 : window.innerHeight) - 210) / 34,
    ),
  );
  const columns = Math.max(1, Math.ceil(items.length / availableRows));

  return (
    <div
      className="quick-nav-drag-overlay"
      role="status"
      aria-live="polite"
      aria-label="Navigasi cepat Alkitab"
    >
      <div className="quick-nav-floater">
        <strong>
          {dragState.bookName} {dragState.chapter}
          {dragState.verse > 0 ? `:${dragState.verse}` : ""}
        </strong>
        <span>{dragState.isOutside ? "Di luar area" : columnLabel}</span>
        <small>
          {dragState.isOutside
            ? "Geser kembali ke dalam box untuk memilih"
            : dragState.activeColumn === "verse"
              ? "Lepaskan untuk memilih ayat"
              : "Lepas untuk ayat 1 · diam 1 detik untuk lanjut"}
        </small>
      </div>

      <div className="quick-nav-columns-container">
        <div className="quick-nav-column is-active-column">
          <div className="quick-nav-column-header">{columnLabel}</div>
          <div
            className="quick-nav-column-list"
            ref={listRef}
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${availableRows}, minmax(28px, auto))`,
              gridAutoFlow: "column",
            }}
          >
            {items.map((item) => (
              <div
                key={item.value}
                data-quick-nav-value={item.value}
                className={`quick-nav-item${item.value === selected ? " is-selected" : ""}`}
              >
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function highlightMatch(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const terms = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return text;
  const regex = new RegExp(`(${terms.join("|")})`, "gi");
  const parts = text.split(regex);
  return (
    <>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bible-picker-mark">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

/**
 * Standard modal-based picker for Books, Chapters, and Verses.
 * Features instant book selection, verse text search, and scope filter pills.
 */
export function BiblePickerModal({
  open,
  onClose,
  books,
  currentBookId,
  currentChapter,
  currentVerse,
  allVerses,
  onSelect,
  locale = "id",
}: {
  open: boolean;
  onClose: () => void;
  books: readonly BibleBook[];
  currentBookId: number;
  currentChapter: number;
  currentVerse?: number | undefined;
  allVerses?: readonly BibleVerse[] | undefined;
  onSelect: (target: {
    bookId: number;
    chapter: number;
    verse?: number;
  }) => void;
  locale?: Locale;
}) {
  const [activeTab, setActiveTab] = useState<"book" | "chapter" | "verse">(
    "book",
  );
  const [selectedBookId, setSelectedBookId] = useState(currentBookId);
  const [selectedChapter, setSelectedChapter] = useState(currentChapter);
  const [searchFilter, setSearchFilter] = useState("");
  const [scope, setScope] = useState<"all" | "old" | "new" | "current">("all");
  const modalRef = useRef<HTMLDivElement | null>(null);

  // Sync state when opened
  useEffect(() => {
    if (open) {
      setSelectedBookId(currentBookId);
      setSelectedChapter(currentChapter);
      setActiveTab("book");
      setSearchFilter("");
    }
  }, [currentBookId, currentChapter, open]);

  // Handle escape key
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  const currentBook = useMemo(
    () => books.find((b) => b.id === selectedBookId) ?? books[0],
    [books, selectedBookId],
  );

  const currentActiveBook = useMemo(
    () => books.find((b) => b.id === currentBookId) ?? books[0],
    [books, currentBookId],
  );

  const filteredBooks = useMemo(() => {
    let list = books;
    if (scope === "old") {
      list = list.filter((b) => b.id <= 39);
    } else if (scope === "new") {
      list = list.filter((b) => b.id >= 40);
    } else if (scope === "current" && currentActiveBook) {
      list = list.filter((b) => b.id === currentActiveBook.id);
    }
    return list;
  }, [books, scope, currentActiveBook]);

  const searchResults = useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    if (!q) return null;

    // 1. Matching books
    let bList = books;
    if (scope === "old") {
      bList = bList.filter((b) => b.id <= 39);
    } else if (scope === "new") {
      bList = bList.filter((b) => b.id >= 40);
    } else if (scope === "current" && currentActiveBook) {
      bList = bList.filter((b) => b.id === currentActiveBook.id);
    }
    const matchingBooks = bList.filter((b) => b.name.toLowerCase().includes(q));

    // 2. Matching verses in verse content
    const matchingVerses: Array<{
      bookId: number;
      bookName: string;
      chapter: number;
      verse: number;
      text: string;
    }> = [];

    if (allVerses && allVerses.length > 0) {
      const terms = q.split(/\s+/).filter(Boolean);
      const bookMap = new Map(books.map((b) => [String(b.id), b]));

      for (const v of allVerses) {
        const bId = Number(v.book);
        if (scope === "old" && bId > 39) continue;
        if (scope === "new" && bId < 40) continue;
        if (
          scope === "current" &&
          currentActiveBook &&
          bId !== currentActiveBook.id
        )
          continue;

        const b = bookMap.get(String(v.book));
        const bookName = b?.name ?? `Kitab ${v.book}`;
        const cleanText = sanitizeBibleText(v.text);
        const targetText =
          `${bookName} ${v.chapter}:${v.verse} ${cleanText}`.toLowerCase();

        if (terms.every((t) => targetText.includes(t))) {
          matchingVerses.push({
            bookId: bId,
            bookName,
            chapter: v.chapter,
            verse: v.verse,
            text: cleanText,
          });
          if (matchingVerses.length >= 80) break;
        }
      }
    }

    return {
      matchingBooks,
      matchingVerses,
    };
  }, [books, allVerses, searchFilter, scope, currentActiveBook]);

  const verseCountForChapter = useMemo(() => {
    if (!currentBook || !allVerses) return 30;
    const count = allVerses.filter(
      (v) => v.book === String(currentBook.id) && v.chapter === selectedChapter,
    ).length;
    return count > 0 ? count : 30;
  }, [allVerses, currentBook, selectedChapter]);

  const handleBookClick = (book: BibleBook) => {
    hapticTick("light");
    setSelectedBookId(book.id);
    setSelectedChapter(1);
    setActiveTab("chapter");
  };

  const handleChapterClick = (ch: number) => {
    hapticTick("light");
    setSelectedChapter(ch);
    setActiveTab("verse");
  };

  const handleVerseClick = (v: number) => {
    hapticTick("medium");
    onSelect({ bookId: selectedBookId, chapter: selectedChapter, verse: v });
    onClose();
  };

  const handleJumpEntireChapter = () => {
    hapticTick("medium");
    onSelect({ bookId: selectedBookId, chapter: selectedChapter });
    onClose();
  };

  if (!open) return null;

  return (
    <div
      className="bible-picker-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="bible-picker-modal"
        style={{ width: "min(640px, 100%)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="bible-picker-title"
        ref={modalRef}
      >
        <div className="bible-picker-header">
          <div>
            <p className="date-line">Navigasi Alkitab</p>
            <h2 id="bible-picker-title">Pilih Kitab & Pasal</h2>
          </div>
          <button
            className="text-button"
            type="button"
            onClick={onClose}
            aria-label="Tutup pemilih kitab"
          >
            Tutup <kbd>Esc</kbd>
          </button>
        </div>

        {/* Step Breadcrumb / Tabs */}
        <div
          className="bible-picker-tabs"
          role="tablist"
          aria-label="Langkah pemilihan"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "book"}
            className={`bible-picker-tab${activeTab === "book" ? " is-active" : ""}`}
            onClick={() => setActiveTab("book")}
          >
            {translate(locale, "bible.book")}:{" "}
            <strong>{currentBook?.name ?? "Pilih"}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chapter"}
            className={`bible-picker-tab${activeTab === "chapter" ? " is-active" : ""}`}
            onClick={() => setActiveTab("chapter")}
          >
            {translate(locale, "bible.chapter")}:{" "}
            <strong>{selectedChapter}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "verse"}
            className={`bible-picker-tab${activeTab === "verse" ? " is-active" : ""}`}
            onClick={() => setActiveTab("verse")}
          >
            Ayat
          </button>
        </div>

        {/* Tab 1: Kitab & Pencarian Ayat */}
        {activeTab === "book" && (
          <div className="bible-picker-tab-content" role="tabpanel">
            <div className="bible-picker-filter-row">
              <input
                type="search"
                className="bible-picker-search"
                placeholder="Cari kitab atau isi ayat…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                autoFocus
                aria-label="Cari kitab atau isi ayat"
              />
              <div className="bible-picker-testament-pills">
                <button
                  type="button"
                  className={`pill-button${scope === "all" ? " is-active" : ""}`}
                  onClick={() => setScope("all")}
                >
                  Semua (66)
                </button>
                <button
                  type="button"
                  className={`pill-button${scope === "old" ? " is-active" : ""}`}
                  onClick={() => setScope("old")}
                >
                  PL (39)
                </button>
                <button
                  type="button"
                  className={`pill-button${scope === "new" ? " is-active" : ""}`}
                  onClick={() => setScope("new")}
                >
                  PB (27)
                </button>
                {currentActiveBook && (
                  <button
                    type="button"
                    className={`pill-button${scope === "current" ? " is-active" : ""}`}
                    onClick={() => setScope("current")}
                  >
                    {currentActiveBook.name} Saja
                  </button>
                )}
              </div>
            </div>

            {searchResults ? (
              <div className="bible-picker-results">
                {searchResults.matchingBooks.length > 0 && (
                  <div>
                    <h3 className="bible-picker-section-title">
                      Kitab ({searchResults.matchingBooks.length})
                    </h3>
                    <div className="bible-picker-book-grid">
                      {searchResults.matchingBooks.map((b) => (
                        <button
                          key={b.id}
                          type="button"
                          className={`book-grid-btn${b.id === selectedBookId ? " is-current" : ""}`}
                          onClick={() => handleBookClick(b)}
                        >
                          {highlightMatch(b.name, searchFilter)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.matchingVerses.length > 0 && (
                  <div>
                    <h3 className="bible-picker-section-title">
                      Ayat Alkitab ({searchResults.matchingVerses.length}
                      {searchResults.matchingVerses.length >= 80 ? "+" : ""})
                    </h3>
                    <div className="bible-picker-verse-list" role="list">
                      {searchResults.matchingVerses.map((item, idx) => (
                        <button
                          key={`${item.bookId}-${item.chapter}-${item.verse}-${idx}`}
                          type="button"
                          className="bible-picker-verse-item"
                          onClick={() => {
                            hapticTick("medium");
                            onSelect({
                              bookId: item.bookId,
                              chapter: item.chapter,
                              verse: item.verse,
                            });
                            onClose();
                          }}
                        >
                          <span className="bible-picker-verse-ref">
                            {item.bookName} {item.chapter}:{item.verse}
                          </span>
                          <span className="bible-picker-verse-text">
                            {highlightMatch(item.text, searchFilter)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {searchResults.matchingBooks.length === 0 &&
                  searchResults.matchingVerses.length === 0 && (
                    <p className="bible-side-empty">
                      Tidak ada kitab atau ayat yang cocok dengan &ldquo;
                      {searchFilter}&rdquo;.
                    </p>
                  )}
              </div>
            ) : (
              <div className="bible-picker-book-grid">
                {filteredBooks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className={`book-grid-btn${b.id === selectedBookId ? " is-current" : ""}`}
                    onClick={() => handleBookClick(b)}
                  >
                    {b.name}
                  </button>
                ))}
                {filteredBooks.length === 0 && (
                  <p className="bible-side-empty">
                    Tidak ada kitab yang cocok.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Pasal */}
        {activeTab === "chapter" && currentBook && (
          <div className="bible-picker-tab-content" role="tabpanel">
            <div className="bible-picker-subheading">
              <strong>{currentBook.name}</strong> · {currentBook.chapters} pasal
              <button
                type="button"
                className="quiet-button"
                onClick={handleJumpEntireChapter}
              >
                Buka {currentBook.name} {selectedChapter}
              </button>
            </div>
            <div className="bible-picker-num-grid">
              {Array.from(
                { length: currentBook.chapters },
                (_, i) => i + 1,
              ).map((ch) => (
                <button
                  key={ch}
                  type="button"
                  className={`num-grid-btn${ch === selectedChapter ? " is-current" : ""}`}
                  onClick={() => handleChapterClick(ch)}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Tab 3: Ayat */}
        {activeTab === "verse" && currentBook && (
          <div className="bible-picker-tab-content" role="tabpanel">
            <div className="bible-picker-subheading">
              <strong>
                {currentBook.name} {selectedChapter}
              </strong>{" "}
              · {verseCountForChapter} ayat
              <button
                type="button"
                className="primary-button"
                onClick={handleJumpEntireChapter}
              >
                Buka Seluruh Pasal
              </button>
            </div>
            <div className="bible-picker-num-grid">
              {Array.from(
                { length: verseCountForChapter },
                (_, i) => i + 1,
              ).map((v) => (
                <button
                  key={v}
                  type="button"
                  className={`num-grid-btn${v === currentVerse ? " is-current" : ""}`}
                  onClick={() => handleVerseClick(v)}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
