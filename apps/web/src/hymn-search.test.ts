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
});
