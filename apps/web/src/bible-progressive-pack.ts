import type { BibleBook, BibleReaderPack } from "@gys/contracts";
import { loadBibleBookPack, type BibleBookPack } from "./bible-pack-loader.js";

/**
 * The reader used to wait for the whole 1,7 MB shelf before its first chapter.
 * The build also writes one small pack per book plus an index
 * (`apps/web/scripts/split-bible-pack.mjs`); this module grows a reader-shaped
 * pack from the books the reader actually shows, so the first chapter costs one
 * book instead of sixty-six.
 */

export type BibleBookIndexEntry = {
  id: string;
  name: string;
  short: string;
  chapters: number;
  file: string;
  bytes: number;
  verses: number;
};

export function bibleBookIndexUrl(base = import.meta.env.BASE_URL): string {
  return `${base}offline/bible/books/index.json`;
}

function isIndexEntry(value: unknown): value is BibleBookIndexEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<BibleBookIndexEntry>;
  return (
    typeof entry.id === "string" &&
    entry.id.length > 0 &&
    typeof entry.name === "string" &&
    entry.name.length > 0 &&
    typeof entry.chapters === "number" &&
    entry.chapters > 0
  );
}

// The index is the same 66-row document on every visit; re-fetching it per
// navigation cost 9 requests in the warm-navigation budget test.
const indexRequests = new Map<string, Promise<BibleBookIndexEntry[]>>();

export function clearBibleBookIndexCache() {
  indexRequests.clear();
}

export async function loadBibleBookIndex(
  url = bibleBookIndexUrl(),
): Promise<BibleBookIndexEntry[]> {
  const cached = indexRequests.get(url);
  if (cached) return cached;
  const request = fetchBibleBookIndex(url).catch((error: unknown) => {
    indexRequests.delete(url);
    throw error;
  });
  indexRequests.set(url, request);
  return request;
}

async function fetchBibleBookIndex(
  url: string,
): Promise<BibleBookIndexEntry[]> {
  const response = await fetch(url, { cache: "force-cache" });
  if (!response.ok)
    throw new Error(`Bible book index failed: ${response.status}`);
  const body = (await response.json()) as { books?: unknown };
  const books = Array.isArray(body.books) ? body.books : [];
  const entries = books.filter(isIndexEntry);
  if (!entries.length) throw new Error("Bible book index is empty");
  return entries;
}

type BookLoader = (bookId: string) => Promise<BibleBookPack>;

function toReaderBook(entry: BibleBookIndexEntry): BibleBook {
  return {
    id: Number(entry.id),
    short: entry.short,
    name: entry.name,
    chapters: entry.chapters,
  };
}

export class ProgressiveBiblePack {
  readonly #index: BibleBookIndexEntry[];
  readonly #load: BookLoader;
  readonly #translation: string;
  readonly #source: string;
  readonly #books = new Map<string, BibleBook>();
  readonly #pending = new Map<string, Promise<void>>();
  readonly #verses = new Map<string, BibleReaderPack["verses"]>();
  readonly #pericopes = new Map<
    string,
    NonNullable<BibleReaderPack["pericopes"]>
  >();
  readonly #crossRefs = new Map<
    string,
    NonNullable<BibleReaderPack["crossRefs"]>
  >();

  constructor(
    index: BibleBookIndexEntry[],
    options: {
      translation?: string;
      source?: string;
      load?: BookLoader;
    } = {},
  ) {
    this.#index = index;
    this.#load = options.load ?? loadBibleBookPack;
    this.#translation = options.translation ?? "TB";
    this.#source = options.source ?? "split";
  }

  get loadedBooks(): string[] {
    return [...this.#verses.keys()];
  }

  /** Loads one book once; concurrent callers share the request. */
  ensure(bookId: string): Promise<void> {
    const id = String(bookId);
    if (this.#verses.has(id)) return Promise.resolve();
    const pending = this.#pending.get(id);
    if (pending) return pending;
    const request = this.#load(id)
      .then((pack) => {
        const entry = this.#index.find((candidate) => candidate.id === id);
        this.#books.set(id, toReaderBook(entry ?? fallbackEntry(id, pack)));
        this.#verses.set(id, pack.verses);
        this.#pericopes.set(id, pack.pericopes ?? []);
        if (pack.crossRefs) this.#crossRefs.set(id, pack.crossRefs);
      })
      .finally(() => this.#pending.delete(id));
    this.#pending.set(id, request);
    return request;
  }

  /**
   * A reader-shaped pack with the loaded books in canonical order. Returns
   * `undefined` until at least one book has arrived, so callers keep their
   * loading state instead of rendering an empty chapter list.
   */
  snapshot(): BibleReaderPack | undefined {
    const loaded = [...this.#verses.keys()].sort(
      (a, b) => Number(a) - Number(b),
    );
    if (!loaded.length) return undefined;
    // The shelf is complete so the picker and the chapter stepper keep every
    // book; a book that arrived without an index row still joins the shelf.
    const entries = new Map(this.#index.map((entry) => [entry.id, entry]));
    const order = [...new Set([...entries.keys(), ...loaded])].sort(
      (a, b) => Number(a) - Number(b),
    );
    const books = order
      .map((id) => {
        const known = this.#books.get(id);
        if (known) return known;
        const entry = entries.get(id);
        return entry ? toReaderBook(entry) : undefined;
      })
      .filter((book): book is BibleBook => Boolean(book));
    return {
      version: 1,
      translation: this.#translation,
      source: this.#source,
      books,
      verses: order.flatMap((id) => this.#verses.get(id) ?? []),
      pericopes: order.flatMap((id) => this.#pericopes.get(id) ?? []),
      // Markers paint with the chapter; waiting for the full shelf made verses
      // grow their reference count after the reader already showed them.
      crossRefs: Object.assign(
        {},
        ...order.map((id) => this.#crossRefs.get(id) ?? {}),
      ),
    };
  }
}

function fallbackEntry(id: string, pack: BibleBookPack): BibleBookIndexEntry {
  const chapters = Math.max(...pack.verses.map((verse) => verse.chapter), 1);
  return {
    id,
    name: pack.book.name ?? id,
    short: pack.book.name ?? id,
    chapters,
    file: `${id}.json.gz`,
    bytes: 0,
    verses: pack.verses.length,
  };
}
