// @ts-nocheck - this DOM-typed package reads the generated corpus via Node builtins.
import { readFileSync } from "node:fs";
import { HymnCatalogEntrySchema } from "@gys/contracts";
import { expect, it } from "vitest";
import { buildHymnSearchIndex, searchHymns } from "./hymn-search.js";

const UPSTREAM_COMMIT = "e8e7efe1189b5746a2bb542348e221844091c8d1";

type CatalogSnapshot = { sourceCommit: string; items: unknown[] };

const snapshot = JSON.parse(
  readFileSync(
    new URL("../public/offline/hymn-catalog.json", import.meta.url),
    "utf8",
  ),
) as CatalogSnapshot;
const entries = snapshot.items.map((item) =>
  HymnCatalogEntrySchema.parse(item),
);

function sourceNumber(id: string, number: number): string {
  return (
    id.match(/^hymn-(\d+[a-z]?)$/i)?.[1]?.toLowerCase() ??
    String(number).padStart(3, "0")
  );
}

function normalizeUpstreamLyrics(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ");
}

const upstreamRows = entries.map((item) => {
  const number = sourceNumber(item.id, item.number);
  return {
    item,
    number,
    title: item.title.toLowerCase(),
    lyricHaystack: normalizeUpstreamLyrics(
      [number, item.title, ...item.verses].join("\n"),
    ),
  };
});

/** Mirrors filterPujianList and its lyric normalizer at UPSTREAM_COMMIT. */
function upstreamSearch(query: string) {
  const keywords = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return upstreamRows
    .filter((row) =>
      keywords.every((keyword) => {
        const token = normalizeUpstreamLyrics(keyword);
        return (
          row.number.includes(keyword) ||
          row.title.includes(keyword) ||
          (Boolean(token) && row.lyricHaystack.includes(token))
        );
      }),
    )
    .map((row) => row.item)
    .sort((left, right) => left.number - right.number);
}

function upstreamSearchWords(value: string): string[] {
  return normalizeUpstreamLyrics(value)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !/\p{M}/u.test(word.normalize("NFD")));
}

it("matches the pinned upstream search across all song verses and query terms", () => {
  expect(snapshot.sourceCommit).toBe(UPSTREAM_COMMIT);
  expect(entries).toHaveLength(533);

  const queries = new Set<string>([""]);
  for (const item of entries) {
    const number = sourceNumber(item.id, item.number);
    const titleWords = upstreamSearchWords(item.title);
    queries.add(number);
    queries.add(number.padStart(3, "0"));
    if (titleWords.length) {
      queries.add(titleWords.join(" "));
    }
    for (let verseIndex = 0; verseIndex < item.verses.length; verseIndex++) {
      const verse = item.verses[verseIndex]!;
      const verseWords = upstreamSearchWords(verse);
      if (verseWords.length) queries.add(verseWords.join(" "));
      if (titleWords[0] && verseWords[0])
        queries.add(`${titleWords[0]} ${verseWords[0]}`);
    }
  }

  const index = buildHymnSearchIndex(entries);
  for (const query of queries) {
    expect(
      searchHymns(index, query, "all").map((item) => item.id),
      `upstream mismatch for ${JSON.stringify(query)}`,
    ).toEqual(upstreamSearch(query).map((item) => item.id));
  }

  for (const book of new Set(entries.map((item) => item.book))) {
    const query = sourceNumber(
      entries.find((item) => item.book === book)!.id,
      entries.find((item) => item.book === book)!.number,
    );
    expect(
      searchHymns(index, query, book).map((item) => item.id),
      `collection filter mismatch for ${book}`,
    ).toEqual(
      upstreamSearch(query)
        .filter((item) => item.book === book)
        .map((item) => item.id),
    );
  }
}, 30_000);
