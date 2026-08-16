import { BibleReaderPackSchema, type BibleReaderPack } from "@gys/contracts";
import { sanitizeBibleText, type BibleVerse } from "@gys/domain";

/**
 * Lazily loaded offline TB reader pack used by the cross-space search. The
 * 7 MB pack is fetched only when the search surface is opened and stays
 * cached for the session; a transient failure is retryable on the next open
 * instead of being permanently cached.
 */
let biblePackPromise: Promise<BibleReaderPack> | undefined;

export function loadBiblePack(): Promise<BibleReaderPack> {
  biblePackPromise ??= fetch(
    `${import.meta.env.BASE_URL}offline/bible/tb-reader.json`,
    { cache: "force-cache" },
  )
    .then(async (response) => {
      if (!response.ok)
        throw new Error(`TB reader pack failed: ${response.status}`);
      const json: unknown = await response.json();
      const parsed = BibleReaderPackSchema.safeParse(json);
      if (!parsed.success) throw new Error("TB reader pack is invalid");
      return parsed.data;
    })
    .catch((error: unknown) => {
      biblePackPromise = undefined;
      throw error;
    });
  return biblePackPromise;
}

/** Resolve a numeric TB book id to its display name. */
export function bibleBookName(
  pack: BibleReaderPack,
  bookId: string | number,
): string {
  const book = pack.books.find(
    (candidate) => String(candidate.id) === String(bookId),
  );
  return book?.name ?? String(bookId);
}

export type BibleSearchEntry = {
  id: string;
  kind: "bible";
  title: string;
  detail: string;
  searchText: string;
  href: string;
};

/** Map raw verse matches into compact search entries with a clean snippet. */
export function bibleVerseEntries(
  pack: BibleReaderPack,
  verses: readonly BibleVerse[],
): BibleSearchEntry[] {
  return verses.slice(0, 6).map((verse) => {
    const book = bibleBookName(pack, verse.book);
    const text = sanitizeBibleText(verse.text);
    return {
      id: `bible-${verse.id}`,
      kind: "bible",
      title: `${book} ${verse.chapter}:${verse.verse}`,
      detail: text.slice(0, 110),
      searchText: `${book} ${verse.chapter}:${verse.verse} ${text}`,
      href: bibleVerseHref(verse),
    };
  });
}

/** Internal deep link that keeps the reader inside the application shell. */
export function bibleVerseHref(verse: BibleVerse): string {
  return `/bible?book=${encodeURIComponent(String(verse.book))}&chapter=${verse.chapter}&verse=${verse.verse}`;
}

export type BibleDeepLink = { book: string; chapter: number; verse: number };

/** Parse the deep-link query parameters with strict integer bounds. */
export function parseBibleDeepLink(
  params: URLSearchParams | undefined,
): BibleDeepLink | undefined {
  if (!params) return undefined;
  const book = params.get("book");
  const chapter = Number(params.get("chapter"));
  const verse = Number(params.get("verse"));
  if (
    !book ||
    !Number.isInteger(chapter) ||
    chapter < 1 ||
    !Number.isInteger(verse) ||
    verse < 1
  )
    return undefined;
  return { book, chapter, verse };
}

/** Clamp a deep link to the actual book/chapter bounds of the loaded pack. */
export function resolveBibleDeepLink(
  pack: BibleReaderPack,
  link: BibleDeepLink,
): { bookId: number; chapter: number; verse: number } | undefined {
  const book = pack.books.find(
    (candidate) => String(candidate.id) === String(link.book),
  );
  if (!book) return undefined;
  const chapter = Math.min(link.chapter, book.chapters);
  const verses = pack.verses.filter(
    (verse) =>
      String(verse.book) === String(book.id) && verse.chapter === chapter,
  );
  if (verses.length === 0) return undefined;
  const verse = Math.min(link.verse, verses[verses.length - 1]?.verse ?? 1);
  return { bookId: book.id, chapter, verse };
}
