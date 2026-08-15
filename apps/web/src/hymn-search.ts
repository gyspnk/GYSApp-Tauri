import type { HymnCatalogEntry } from "@gys/contracts";

/**
 * Search data is intentionally built once per catalog revision. Keeping the
 * normalized haystack and token set beside each item avoids lower-casing the
 * complete 533-song lyric corpus on every keystroke.
 */
export type HymnSearchIndex = {
  item: HymnCatalogEntry;
  haystack: string;
  tokens: ReadonlySet<string>;
};

export function normalizeHymnSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/\p{Mark}/gu, "")
    .toLocaleLowerCase("id-ID")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim();
}

function tokenize(value: string): ReadonlySet<string> {
  return new Set(value ? value.split(" ").filter(Boolean) : []);
}

export function buildHymnSearchIndex(
  entries: readonly HymnCatalogEntry[],
): HymnSearchIndex[] {
  return entries.map((item) => {
    const number = String(item.number);
    const paddedNumber = number.padStart(3, "0");
    const haystack = normalizeHymnSearchText(
      `${number} ${paddedNumber} ${item.title} ${item.book} ${item.lyrics}`,
    );
    return { item, haystack, tokens: tokenize(haystack) };
  });
}

type QueryPart = { phrase: boolean; value: string };

function parseQuery(query: string): QueryPart[] {
  const parts: QueryPart[] = [];
  for (const match of query.matchAll(/"([^"\n]+)"|([^\s]+)/g)) {
    const raw = match[1] ?? match[2] ?? "";
    const value = normalizeHymnSearchText(raw);
    if (value) parts.push({ phrase: Boolean(match[1]), value });
  }
  return parts;
}

function hasTokenPrefix(tokens: ReadonlySet<string>, value: string): boolean {
  for (const token of tokens) if (token.startsWith(value)) return true;
  return false;
}

function matches(index: HymnSearchIndex, parts: readonly QueryPart[]): boolean {
  return parts.every((part) =>
    part.phrase
      ? index.haystack.includes(part.value)
      : index.tokens.has(part.value) ||
        hasTokenPrefix(index.tokens, part.value),
  );
}

/** Search with AND semantics; quoted terms remain contiguous phrases. */
export function searchHymns(
  index: readonly HymnSearchIndex[],
  query: string,
  book: string,
): HymnCatalogEntry[] {
  const parts = parseQuery(query.trim());
  return index
    .filter(
      (candidate) =>
        (book === "all" || candidate.item.book === book) &&
        matches(candidate, parts),
    )
    .map((candidate) => candidate.item)
    .sort((left, right) => left.number - right.number);
}
