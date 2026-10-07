import { useEffect, useMemo, useRef } from "react";
import type { BibleBook } from "@gys/contracts";
import { translate, type Locale } from "./i18n.js";
export { BiblePickerModal } from "./bible-picker.js";

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
  locale,
}: {
  books: readonly BibleBook[];
  dragState: QuickNavDragState;
  locale: Locale;
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
    const labelKey =
      dragState.activeColumn === "book"
        ? "bible.quickBook"
        : dragState.activeColumn === "chapter"
          ? "bible.quickChapter"
          : "bible.quickVerse";
    return translate(locale, "bible.quickDrag", {
      label: translate(locale, labelKey),
    });
  }, [dragState.activeColumn, locale]);
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
      aria-label={translate(locale, "bible.quickNavAria")}
    >
      <div className="quick-nav-floater">
        <strong>
          {dragState.bookName} {dragState.chapter}
          {dragState.verse > 0 ? `:${dragState.verse}` : ""}
        </strong>
        <span>
          {dragState.isOutside
            ? translate(locale, "bible.quickOutside")
            : columnLabel}
        </span>
        <small>
          {dragState.isOutside
            ? translate(locale, "bible.quickOutsideHint")
            : dragState.activeColumn === "verse"
              ? translate(locale, "bible.quickRelease")
              : translate(locale, "bible.quickContinue")}
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
