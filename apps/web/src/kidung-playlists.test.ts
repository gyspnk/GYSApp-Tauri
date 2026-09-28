import { describe, expect, it } from "vitest";
import type { HymnCatalogEntry } from "@gys/contracts";
import { importUpstreamPlaylist } from "./kidung-playlists.js";

const catalog: HymnCatalogEntry[] = [
  {
    id: "hymn-051A",
    book: "rohani",
    number: 51,
    title: "Batu Zaman",
    verses: ["Batu Zaman"],
    lyrics: "Batu Zaman",
    midiPath: "docs/assets/051A.mid",
    pdfPath: "docs/assets/051A.pdf",
  },
];

describe("saved playlist import", () => {
  it("resolves lettered numbers to the catalog's canonical song id", () => {
    expect(
      importUpstreamPlaylist(
        {
          name: "Lettered hymns",
          songs: [{ nomor: "051a", judul: "Batu Zaman" }],
        },
        catalog,
      ).songIds,
    ).toEqual(["hymn-051A"]);
  });
});
