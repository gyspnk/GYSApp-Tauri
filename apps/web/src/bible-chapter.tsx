import {
  DEFAULT_HIGHLIGHT_COLORS,
  isCustomHighlightColor,
} from "./bible-highlights.js";
import { useMemo, type CSSProperties, type TouchEvent } from "react";
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
      >
        {verses.map((verse) => {
          const selected = selectedVerseId === verse.id;
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
