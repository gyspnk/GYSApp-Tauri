import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { BibleBook, BibleVerse } from "@gys/contracts";
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
  const bookListRef = useRef<HTMLDivElement | null>(null);
  const chapterListRef = useRef<HTMLDivElement | null>(null);
  const verseListRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active column to keep the selected item in view
  useEffect(() => {
    const activeRef =
      dragState.activeColumn === "book"
        ? bookListRef
        : dragState.activeColumn === "chapter"
          ? chapterListRef
          : verseListRef;
    const container = activeRef.current;
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
        <span>{columnLabel}</span>
        <small>Lepaskan untuk membuka</small>
      </div>

      <div
        className="quick-nav-columns-container"
        style={{
          width: "min(640px, 100%)",
          height: "min(340px, calc(100vh - 180px))",
        }}
      >
        {/* Kolom 1: Kitab */}
        <div
          className={`quick-nav-column is-book${dragState.activeColumn === "book" ? " is-active-column" : ""}`}
        >
          <div className="quick-nav-column-header">Kitab</div>
          <div className="quick-nav-column-list" ref={bookListRef}>
            {books.map((b) => (
              <div
                key={b.id}
                className={`quick-nav-item${b.id === dragState.bookId ? " is-selected" : ""}`}
              >
                {b.name}
              </div>
            ))}
          </div>
        </div>

        {/* Kolom 2: Pasal */}
        <div
          className={`quick-nav-column is-chapter${dragState.activeColumn === "chapter" ? " is-active-column" : ""}`}
        >
          <div className="quick-nav-column-header">Pasal</div>
          <div className="quick-nav-column-list" ref={chapterListRef}>
            {Array.from(
              { length: dragState.totalChapters },
              (_, i) => i + 1,
            ).map((ch) => (
              <div
                key={ch}
                className={`quick-nav-item${ch === dragState.chapter ? " is-selected" : ""}`}
              >
                {ch}
              </div>
            ))}
          </div>
        </div>

        {/* Kolom 3: Ayat */}
        <div
          className={`quick-nav-column is-verse${dragState.activeColumn === "verse" ? " is-active-column" : ""}`}
        >
          <div className="quick-nav-column-header">Ayat</div>
          <div className="quick-nav-column-list" ref={verseListRef}>
            {Array.from(
              { length: Math.max(1, dragState.totalVerses) },
              (_, i) => i + 1,
            ).map((v) => (
              <div
                key={v}
                className={`quick-nav-item${v === dragState.verse ? " is-selected" : ""}`}
              >
                {v}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Standard Book / Chapter / Verse Picker Modal Dialog.
 * Opens on single tap of the chapter title or via picker button.
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
  const [testament, setTestament] = useState<"all" | "old" | "new">("all");
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

  const filteredBooks = useMemo(() => {
    let list = books;
    if (testament === "old") {
      list = list.filter((b) => b.id <= 39);
    } else if (testament === "new") {
      list = list.filter((b) => b.id >= 40);
    }
    if (searchFilter.trim()) {
      const q = searchFilter.toLowerCase().trim();
      list = list.filter((b) => b.name.toLowerCase().includes(q));
    }
    return list;
  }, [books, searchFilter, testament]);

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
            Kitab: <strong>{currentBook?.name ?? "Pilih"}</strong>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "chapter"}
            className={`bible-picker-tab${activeTab === "chapter" ? " is-active" : ""}`}
            onClick={() => setActiveTab("chapter")}
          >
            Pasal: <strong>{selectedChapter}</strong>
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

        {/* Tab 1: Kitab */}
        {activeTab === "book" && (
          <div className="bible-picker-tab-content" role="tabpanel">
            <div className="bible-picker-filter-row">
              <input
                type="search"
                className="bible-picker-search"
                placeholder="Cari nama kitab…"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                autoFocus
              />
              <div className="bible-picker-testament-pills">
                <button
                  type="button"
                  className={`pill-button${testament === "all" ? " is-active" : ""}`}
                  onClick={() => setTestament("all")}
                >
                  Semua (66)
                </button>
                <button
                  type="button"
                  className={`pill-button${testament === "old" ? " is-active" : ""}`}
                  onClick={() => setTestament("old")}
                >
                  PL (39)
                </button>
                <button
                  type="button"
                  className={`pill-button${testament === "new" ? " is-active" : ""}`}
                  onClick={() => setTestament("new")}
                >
                  PB (27)
                </button>
              </div>
            </div>

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
                <p className="bible-side-empty">Tidak ada kitab yang cocok.</p>
              )}
            </div>
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
