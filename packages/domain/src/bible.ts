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
  /** Numeric TB book id → display name, so natural book-name queries match. */
  bookNames?: Readonly<Record<string, string>>;
};

export type BibleSearchOptions = {
  book?: string;
  exactPhrase?: boolean;
  wholeWord?: boolean;
};

const SKIPPED_HTML_TAGS = new Set(["script", "style", "svg", "template"]);

function decodeBibleEntity(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    nbsp: " ",
    quot: '"',
    lt: "<",
    gt: ">",
  };
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi,
    (whole, decimal: string, hexadecimal: string, name: string) => {
      const codePoint = decimal
        ? Number(decimal)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : undefined;
      if (
        codePoint !== undefined &&
        Number.isInteger(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff
      )
        return String.fromCodePoint(codePoint);
      return name ? (named[name.toLowerCase()] ?? whole) : whole;
    },
  );
}

function removeBibleMarkup(value: string): string {
  let output = "";
  let skip: string | undefined;
  let index = 0;
  while (index < value.length) {
    if (value[index] === "<") {
      let end = index + 1;
      let quote = "";
      for (; end < value.length; end += 1) {
        const character = value[end];
        if (quote) {
          if (character === quote) quote = "";
        } else if (character === '"' || character === "'") quote = character;
        else if (character === ">") break;
      }
      const tag = value.slice(index + 1, end).trim();
      const closing = tag.startsWith("/");
      const name = tag.replace(/^\//, "").split(/\s|\//, 1)[0]?.toLowerCase();
      if (skip) {
        if (closing && name === skip) skip = undefined;
      } else if (name && !closing && SKIPPED_HTML_TAGS.has(name)) {
        skip = name;
        const closingTag = value.toLowerCase().indexOf(`</${name}`, end + 1);
        index = closingTag >= 0 ? closingTag : value.length;
        continue;
      } else if (name === "br" || name === "p") {
        output += "\n";
      }
      index = Math.min(value.length, end + 1);
      continue;
    }
    const nextTag = value.indexOf("<", index);
    const nextEntity = value.indexOf("&", index);
    const end = Math.min(
      nextTag >= 0 ? nextTag : value.length,
      nextEntity >= 0 ? nextEntity : value.length,
    );
    if (end === index && value[index] === "&") {
      const semicolon = value.indexOf(";", index + 1);
      if (semicolon > index && semicolon - index <= 32) {
        output += decodeBibleEntity(value.slice(index, semicolon + 1));
        index = semicolon + 1;
        continue;
      }
    }
    output += value.slice(index, end);
    index = end;
  }
  return output;
}

/** Remove markup tokens used by the source TB reader pack safely. */
export function sanitizeBibleText(value: string): string {
  return removeBibleMarkup(value).replace(/\s+/g, " ").trim();
}

function normalizeSearchText(value: string): string {
  return sanitizeBibleText(value)
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "");
}

function parseSearchQuery(value: string): {
  terms: string[];
  phrases: string[];
} {
  const phrases = [...value.matchAll(/"([^\"]+)"/g)]
    .map((match) => normalizeSearchText(match[1] ?? ""))
    .filter(Boolean);
  const unquoted = value.replace(/"[^\"]*"/g, " ");
  const terms = normalizeSearchText(unquoted).split(/\s+/).filter(Boolean);
  return { terms, phrases };
}

export class BibleRepository {
  private readonly pack: readonly BibleVerse[];
  private readonly byId = new Map<string, BibleVerse>();
  private readonly byChapter = new Map<string, BibleVerse[]>();
  private readonly normalizedText = new Map<string, string>();
  private readonly bookmarksSet = new Set<string>();
  private readonly notesById = new Map<string, string>();
  private readonly highlightsById = new Map<string, string>();
  private readonly pericopes: readonly BiblePericope[];
  private readonly referencesById: Readonly<
    Record<string, readonly BibleReference[]>
  >;
  private readonly bookNames: Readonly<Record<string, string>>;
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
    for (const verse of this.pack) {
      this.byId.set(verse.id, verse);
      const key = `${verse.book}:${verse.chapter}`;
      const chapter = this.byChapter.get(key) ?? [];
      chapter.push(verse);
      this.byChapter.set(key, chapter);
    }
    this.pericopes = options.pericopes ?? [];
    this.referencesById = options.references ?? {};
    this.bookNames = options.bookNames ?? {};
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
    return [...(this.byChapter.get(`${book}:${chapter}`) ?? [])];
  }

  public async search(
    query: string,
    options: BibleSearchOptions | string = {},
  ): Promise<BibleVerse[]> {
    const normalized = normalizeSearchText(query.trim());
    if (!normalized) return [];
    const searchOptions: BibleSearchOptions =
      typeof options === "string" ? { book: options } : options;
    const { terms, phrases } = parseSearchQuery(query);
    if (!terms.length && !phrases.length) return [];
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const matches = this.pack.filter((verse) => {
      if (searchOptions.book && verse.book !== searchOptions.book) return false;
      const bookName = this.bookNames[verse.book];
      const searchable =
        this.normalizedText.get(verse.id) ??
        normalizeSearchText(
          `${bookName ?? verse.book} ${verse.book} ${verse.chapter}:${verse.verse} ${verse.text}`,
        );
      this.normalizedText.set(verse.id, searchable);
      if (
        (searchOptions.exactPhrase &&
          phrases.length === 0 &&
          !searchable.includes(normalized)) ||
        phrases.some((phrase) => !searchable.includes(phrase))
      )
        return false;
      if (
        !searchOptions.exactPhrase &&
        phrases.length === 0 &&
        !terms.every((term) => searchable.includes(term))
      )
        return false;
      if (searchOptions.wholeWord) {
        return terms.every((term) =>
          new RegExp(
            `(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}\\p{N}])`,
            "iu",
          ).test(searchable),
        );
      }
      return true;
    });
    // Rank matches so a book whose name matches a query term surfaces before
    // verses that merely mention the word in their text, and reference hits
    // rank above plain text hits. The sort is stable, so canonical book order
    // is preserved inside each tier.
    return matches
      .map((verse) => ({ verse, tier: this.searchTier(verse, terms) }))
      .sort((left, right) => left.tier - right.tier)
      .map(({ verse }) => verse);
  }

  private searchTier(verse: BibleVerse, terms: readonly string[]): number {
    const name = normalizeSearchText(this.bookNames[verse.book] ?? verse.book);
    if (terms.some((term) => name.includes(term))) return 0;
    const reference = normalizeSearchText(verse.chapter + ":" + verse.verse);
    if (terms.some((term) => reference.includes(term))) return 1;
    return 2;
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
