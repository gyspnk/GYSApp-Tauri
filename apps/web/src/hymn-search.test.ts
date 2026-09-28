import { describe, expect, it } from "vitest";
import type { HymnCatalogEntry } from "@gys/contracts";
import {
  buildHymnSearchIndex,
  searchHymns,
  type HymnSearchIndex,
} from "./hymn-search.js";

const entries: HymnCatalogEntry[] = [
  {
    id: "hymn-001",
    number: 1,
    title: "Kasih Tuhan",
    book: "rohani",
    lyrics: "Kasih Tuhan memelihara kami di dalam damai.",
    verses: ["Kasih Tuhan memelihara kami di dalam damai."],
    pdfPath: "kr/001.pdf",
    midiPath: "midi/001.mid",
  },
  {
    id: "hymn-002",
    number: 2,
    title: "Pengharapan",
    book: "pujian",
    lyrics: "Di dalam badai, pengharapan tetap teguh.",
    verses: ["Di dalam badai, pengharapan tetap teguh."],
    pdfPath: "kr/002.pdf",
    midiPath: "midi/002.mid",
  },
  {
    id: "hymn-003",
    number: 3,
    title: "Kasih dan Damai",
    book: "pujian",
    lyrics: "Kasih dan damai menyertai langkah kita.",
    verses: ["Kasih dan damai menyertai langkah kita."],
    pdfPath: "kr/003.pdf",
    midiPath: "midi/003.mid",
  },
];

describe("hymn search index", () => {
  it("builds one reusable index and matches all unquoted terms", () => {
    const index = buildHymnSearchIndex(entries);
    expect(index).toHaveLength(entries.length);
    expect(
      searchHymns(index, "kasih damai", "all").map((item) => item.id),
    ).toEqual(["hymn-001", "hymn-003"]);
    expect(searchHymns(index, "peng", "all").map((item) => item.id)).toEqual([
      "hymn-002",
    ]);
  });

  it("keeps quoted phrases contiguous and supports number/title lookup", () => {
    const index = buildHymnSearchIndex(entries);
    expect(
      searchHymns(index, '"di dalam" badai', "all").map((item) => item.id),
    ).toEqual(["hymn-002"]);
    expect(searchHymns(index, "003", "all").map((item) => item.id)).toEqual([
      "hymn-003",
    ]);
  });

  it("matches substrings inside a title without requiring a token prefix", () => {
    const index = buildHymnSearchIndex([
      ...entries,
      {
        ...entries[0]!,
        id: "hymn-004",
        number: 4,
        title: "Harmoni Baru",
        lyrics: "Nada indah tercipta.",
      },
    ]);
    expect(searchHymns(index, "mon", "all").map((item) => item.id)).toEqual([
      "hymn-004",
    ]);
  });

  it("matches a partial query inside a zero-padded hymn number", () => {
    const index = buildHymnSearchIndex([{ ...entries[1]!, id: "song-two" }]);
    expect(searchHymns(index, "02", "all").map((item) => item.id)).toEqual([
      "song-two",
    ]);
  });

  it("keeps punctuation-normalized upstream keywords contiguous", () => {
    const punctuation = {
      ...entries[0]!,
      id: "hymn-004",
      number: 4,
      title: "Pengharapan",
      lyrics: "Anugerah, kasih Tuhan menyertai kami.",
      verses: ["Anugerah, kasih Tuhan menyertai kami."],
    };
    const index = buildHymnSearchIndex([punctuation]);

    expect(searchHymns(index, "anugerah,kasih", "all")).toEqual([punctuation]);
  });

  it("does not search catalog IDs or collection labels as song content", () => {
    const metadataOnly = {
      ...entries[1]!,
      id: "pujian-secret-marker",
      book: "pujian" as const,
    };
    const index = buildHymnSearchIndex([metadataOnly]);

    expect(searchHymns(index, "secret", "all")).toEqual([]);
    expect(searchHymns(index, "pujian", "all")).toEqual([]);
    expect(searchHymns(index, "peng", "pujian")).toEqual([metadataOnly]);
    expect(searchHymns(index, "peng", "rohani")).toEqual([]);
  });

  it("normalizes accents and applies the collection filter", () => {
    const index: HymnSearchIndex[] = buildHymnSearchIndex([
      ...entries,
      {
        id: "hymn-004",
        number: 4,
        title: "Pengharapan Éndah",
        book: "anak",
        lyrics: "Pengharapan Éndah tetap teguh.",
        verses: ["Pengharapan Éndah tetap teguh."],
        pdfPath: "kr/004.pdf",
        midiPath: "midi/004.mid",
      },
    ]);
    expect(searchHymns(index, "éndah", "anak").map((item) => item.id)).toEqual([
      "hymn-004",
    ]);
    expect(
      searchHymns(index, "kasih", "pujian").map((item) => item.id),
    ).toEqual(["hymn-003"]);
  });

  it("keeps lettered hymn variants searchable by their canonical number", () => {
    const variants = buildHymnSearchIndex([
      {
        ...entries[0]!,
        id: "hymn-051A",
        number: 51,
        title: "Batu Zaman",
      },
      {
        ...entries[0]!,
        id: "hymn-051B",
        number: 51,
        title: "Batu Zaman",
      },
    ]);
    expect(searchHymns(variants, "051A", "all").map((item) => item.id)).toEqual(
      ["hymn-051A"],
    );
    expect(searchHymns(variants, "051B", "all").map((item) => item.id)).toEqual(
      ["hymn-051B"],
    );
  });
});
