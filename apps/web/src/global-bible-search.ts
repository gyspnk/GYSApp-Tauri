import type { BibleReaderPack } from "@gys/contracts";
import { sanitizeBibleText, type BibleVerse } from "@gys/domain";

export { loadBundledBiblePack as loadBiblePack } from "./bible-pack-loader.js";

/** Map numeric TB book ids to display names for the search index. */
export function bibleBookNames(pack: BibleReaderPack): Record<string, string> {
  const names: Record<string, string> = {};
  for (const book of pack.books) names[String(book.id)] = book.name;
  return names;
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
  versionCode = "b_tb",
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
      href: bibleVerseHref(verse, versionCode),
    };
  });
}

/** Internal deep link that keeps the reader inside the application shell. */
export function bibleVerseHref(
  verse: BibleVerse,
  versionCode = "b_tb",
): string {
  return `/bible?book=${encodeURIComponent(String(verse.book))}&chapter=${verse.chapter}&verse=${verse.verse}&version=${encodeURIComponent(versionCode)}`;
}

export type BibleDeepLink = {
  book: string;
  chapter: number;
  verse: number;
  version?: string;
};

/** Parse the deep-link query parameters with strict integer bounds. */
export function parseBibleDeepLink(
  params: URLSearchParams | undefined,
): BibleDeepLink | undefined {
  if (!params) return undefined;
  const book = params.get("book");
  const chapterValue = params.get("chapter");
  const verseValue = params.get("verse");
  const version = params.get("version") ?? undefined;
  if (
    !book ||
    !chapterValue ||
    !verseValue ||
    !/^\d+$/u.test(chapterValue) ||
    !/^\d+$/u.test(verseValue) ||
    (version !== undefined && !/^b_[a-z0-9]{1,16}$/u.test(version))
  )
    return undefined;
  const chapter = Number(chapterValue);
  const verse = Number(verseValue);
  if (
    !Number.isInteger(chapter) ||
    chapter < 1 ||
    !Number.isInteger(verse) ||
    verse < 1
  )
    return undefined;
  return { book, chapter, verse, ...(version ? { version } : {}) };
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
