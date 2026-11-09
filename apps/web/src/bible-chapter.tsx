import {
  DEFAULT_HIGHLIGHT_COLORS,
  isCustomHighlightColor,
} from "./bible-highlights.js";
import { useMemo, useRef, type CSSProperties, type TouchEvent } from "react";
import type {
  BibleBook,
  BibleCrossReference,
  BiblePericope,
} from "@gys/contracts";
import type { BibleVerse } from "@gys/domain";
import { translate, type Locale } from "./i18n.js";
import { BibleVerseText } from "./bible-verse-text.js";

export function ChapterPane({
  locale,
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
  selectedVerseIds,
  speakingVerseId,
  secondary = false,
  scrollRef,
  onScroll,
  onSelect,
  onBookmark,
  onTouchStart,
  onTouchEnd,
  onTouchMove,
  onTouchCancel,
}: {
  locale: Locale;
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
  selectedVerseIds?: readonly string[] | undefined;
  speakingVerseId?: string | undefined;
  secondary?: boolean;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  onSelect: (
    verse: BibleVerse,
    modifiers?: { shiftKey?: boolean; additive?: boolean; longPress?: boolean },
  ) => void;
  onBookmark: (id: string) => void;
  onTouchStart?: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchMove?: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchCancel?: (event: TouchEvent<HTMLDivElement>) => void;
  onTouchEnd?: (event: TouchEvent<HTMLDivElement>) => void;
}) {
  // One shared hold state: only one verse is pressed at a time, and a long
  // press must not be undone by the click event that follows it.
  const press = useRef<{
    timer: number | undefined;
    x?: number;
    y?: number;
    long?: boolean;
  }>({ timer: undefined });
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
      <div className="reader-heading sr-only">
        <p className="date-line">{translation}</p>
        <h2>
          {book.name} {chapter}
        </h2>
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
                      title={translate(locale, "bible.parallelOpen", {
                        text: par.text,
                      })}
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
        onTouchMove={onTouchMove}
        onTouchCancel={onTouchCancel}
      >
        {verses.map((verse) => {
          const selected = selectedVerseIds
            ? selectedVerseIds.includes(verse.id)
            : selectedVerseId === verse.id;
          const speaking = speakingVerseId === verse.id;
          const highlight = highlights[verse.id];
          const highlightClass = highlight
            ? ` is-highlight-${
                DEFAULT_HIGHLIGHT_COLORS.includes(
                  highlight as (typeof DEFAULT_HIGHLIGHT_COLORS)[number],
                )
                  ? highlight
                  : "custom"
              }`
            : "";
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
                          title={translate(locale, "bible.parallelOpen", {
                            text: par.text,
                          })}
                        >
                          {par.text}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
              <article
                className={`verse-row${selected ? " is-selected" : ""}${speaking ? " is-speaking" : ""}${highlightClass}`}
                id={`bible-verse-${verse.id}`}
                aria-current={speaking ? "true" : undefined}
                style={
                  isCustomHighlightColor(highlight ?? "")
                    ? ({
                        "--verse-highlight-color": highlight,
                      } as CSSProperties)
                    : undefined
                }
              >
                <button
                  className={`verse-number${bookmarks.has(verse.id) ? " is-bookmarked" : ""}`}
                  type="button"
                  onClick={() => onBookmark(verse.id)}
                  aria-label={translate(locale, "bible.bookmarkVerse", {
                    verse: verse.verse,
                  })}
                  aria-pressed={bookmarks.has(verse.id)}
                >
                  {verse.verse}
                </button>
                <div className="verse-content">
                  <span
                    className="verse-text"
                    role="button"
                    tabIndex={0}
                    onPointerDown={(event) => {
                      // Press-and-hold is the adaptive way into multi-select:
                      // nothing has to be switched on first.
                      if (event.button !== 0) return;
                      press.current = {
                        x: event.clientX,
                        y: event.clientY,
                        timer: window.setTimeout(() => {
                          press.current.timer = undefined;
                          press.current.long = true;
                          onSelect(verse, { longPress: true });
                        }, 450),
                      };
                    }}
                    onPointerMove={(event) => {
                      const state = press.current;
                      if (!state.timer) return;
                      if (
                        Math.abs(event.clientX - (state.x ?? 0)) > 10 ||
                        Math.abs(event.clientY - (state.y ?? 0)) > 10
                      ) {
                        window.clearTimeout(state.timer);
                        press.current.timer = undefined;
                      }
                    }}
                    onContextMenu={(event) => {
                      // Android raises its own text menu on a long press,
                      // which cancels the hold before 450 ms; while the hold
                      // is armed, keep that menu out of the way.
                      if (press.current.timer || press.current.long) {
                        event.preventDefault();
                      }
                    }}
                    onPointerUp={() => {
                      if (press.current.timer) {
                        window.clearTimeout(press.current.timer);
                        press.current.timer = undefined;
                      }
                    }}
                    onPointerCancel={() => {
                      if (press.current.timer) {
                        window.clearTimeout(press.current.timer);
                        press.current.timer = undefined;
                      }
                      press.current.long = false;
                    }}
                    onClick={(event) => {
                      // The hold already added the verse; the click that follows
                      // must not toggle it back off.
                      if (press.current.long) {
                        press.current.long = false;
                        return;
                      }
                      onSelect(verse, {
                        shiftKey: event.shiftKey,
                        additive: event.metaKey || event.ctrlKey,
                      });
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(verse, { shiftKey: event.shiftKey });
                      }
                    }}
                    aria-pressed={selected}
                  >
                    <BibleVerseText raw={verse.text} />
                  </span>
                  {hasVerseRefs && onOpenCrossRefs && verseRefs && "\u2060"}
                  {hasVerseRefs && onOpenCrossRefs && verseRefs && (
                    <span
                      className="bible-crossref-inline"
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          event.currentTarget.click();
                        }
                      }}
                      aria-label={translate(
                        locale,
                        "bible.crossReferenceAria",
                        {
                          count: verseRefs.length,
                          reference: `${book.name} ${chapter}:${verse.verse}`,
                        },
                      )}
                      title={translate(locale, "bible.crossReferenceTitle", {
                        count: verseRefs.length,
                      })}
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
                    </span>
                  )}
                </div>
                {speaking && (
                  <span className="sr-only" role="status">
                    {translate(locale, "bible.speakingVerse", {
                      verse: verse.verse,
                    })}
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
