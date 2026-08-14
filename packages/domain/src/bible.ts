export type BibleVerse = {
  id: string;
  book: string;
  bookOrder: number;
  chapter: number;
  verse: number;
  text: string;
};
export type BibleReference = { book: string; chapter: number; verse?: number };
export type BiblePericope = {
  id: string;
  title: string;
  start: BibleReference;
  end: BibleReference;
};

export type BibleRepositoryOptions = {
  pericopes?: readonly BiblePericope[];
  references?: Readonly<Record<string, readonly BibleReference[]>>;
};

export class BibleRepository {
  private readonly pack: readonly BibleVerse[];
  private readonly byId = new Map<string, BibleVerse>();
  private readonly bookmarksSet = new Set<string>();
  private readonly notesById = new Map<string, string>();
  private readonly highlightsById = new Map<string, string>();
  private readonly pericopes: readonly BiblePericope[];
  private readonly referencesById: Readonly<
    Record<string, readonly BibleReference[]>
  >;
  private readonly readingHistory: BibleReference[] = [];
  private last: BibleReference | undefined;

  public constructor(
    verses: readonly BibleVerse[],
    options: BibleRepositoryOptions = {},
  ) {
    this.pack = [...verses].sort(
      (left, right) =>
        left.bookOrder - right.bookOrder ||
        left.chapter - right.chapter ||
        left.verse - right.verse,
    );
    for (const verse of this.pack) this.byId.set(verse.id, verse);
    this.pericopes = options.pericopes ?? [];
    this.referencesById = options.references ?? {};
  }

  public books(): { book: string; bookOrder: number; chapters: number[] }[] {
    const byBook = new Map<
      string,
      { bookOrder: number; chapters: Set<number> }
    >();
    for (const verse of this.pack) {
      const current = byBook.get(verse.book) ?? {
        bookOrder: verse.bookOrder,
        chapters: new Set<number>(),
      };
      current.chapters.add(verse.chapter);
      byBook.set(verse.book, current);
    }
    return [...byBook.entries()]
      .map(([book, value]) => ({
        book,
        bookOrder: value.bookOrder,
        chapters: [...value.chapters].sort((left, right) => left - right),
      }))
      .sort((left, right) => left.bookOrder - right.bookOrder);
  }

  public async getVerse(id: string): Promise<BibleVerse | undefined> {
    return this.byId.get(id);
  }

  public async getChapter(
    book: string,
    chapter: number,
  ): Promise<BibleVerse[]> {
    return this.pack.filter(
      (verse) => verse.book === book && verse.chapter === chapter,
    );
  }

  public async search(query: string, book?: string): Promise<BibleVerse[]> {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return [];
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    return this.pack.filter(
      (verse) =>
        (!book || verse.book === book) &&
        `${verse.book} ${verse.chapter}:${verse.verse} ${verse.text}`
          .toLocaleLowerCase()
          .includes(normalized),
    );
  }

  public async setLastReading(reference: BibleReference): Promise<void> {
    this.last = { ...reference };
    this.readingHistory.unshift({ ...reference });
    if (this.readingHistory.length > 30) this.readingHistory.pop();
  }

  public lastReading(): BibleReference | undefined {
    return this.last ? { ...this.last } : undefined;
  }

  public async setBookmark(id: string, selected: boolean): Promise<void> {
    if (selected) this.bookmarksSet.add(id);
    else this.bookmarksSet.delete(id);
  }

  public isBookmarked(id: string): boolean {
    return this.bookmarksSet.has(id);
  }

  public async setNote(id: string, note: string): Promise<void> {
    if (note.trim()) this.notesById.set(id, note.trim());
    else this.notesById.delete(id);
  }

  public note(id: string): string | undefined {
    return this.notesById.get(id);
  }

  public async setHighlight(
    id: string,
    color: string | undefined,
  ): Promise<void> {
    if (color) this.highlightsById.set(id, color);
    else this.highlightsById.delete(id);
  }

  public highlight(id: string): string | undefined {
    return this.highlightsById.get(id);
  }

  public history(): BibleReference[] {
    return this.readingHistory.map((reference) => ({ ...reference }));
  }

  public async getPericope(id: string): Promise<BiblePericope | undefined> {
    return this.pericopes.find((pericope) => pericope.id === id);
  }

  public references(id: string): BibleReference[] {
    return (this.referencesById[id] ?? []).map((reference) => ({
      ...reference,
    }));
  }
}
