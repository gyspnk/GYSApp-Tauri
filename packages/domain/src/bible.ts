export type BibleVerse = {
  id: string;
  book: string;
  bookOrder: number;
  chapter: number;
  verse: number;
  text: string;
};
export type BibleReference = { book: string; chapter: number; verse?: number };

export class BibleRepository {
  private readonly pack: readonly BibleVerse[];
  private readonly byId = new Map<string, BibleVerse>();
  private readonly bookmarksSet = new Set<string>();
  private last: BibleReference | undefined;

  public constructor(verses: readonly BibleVerse[]) {
    this.pack = [...verses].sort(
      (left, right) =>
        left.bookOrder - right.bookOrder ||
        left.chapter - right.chapter ||
        left.verse - right.verse,
    );
    for (const verse of this.pack) this.byId.set(verse.id, verse);
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
}
