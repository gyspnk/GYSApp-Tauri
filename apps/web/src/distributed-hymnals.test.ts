import { describe, expect, it } from "vitest";
import { normalizeDistributedHymnIndex } from "./distributed-hymnals.js";

describe("distributed hymnal catalog", () => {
  it("normalizes a pinned Fork index only after its hymnal is installed", () => {
    const items = normalizeDistributedHymnIndex("HYMNE", [
      {
        number: "001",
        title: "Holy, Holy, Holy",
        verses: ["Holy, holy, holy"],
        pdfFile: "pdf/hymne/001_Holy.pdf",
        midiFile: "midi/hymne/001_Holy.mid",
        page: 5,
        pages: 1,
      },
    ]);

    expect(items).toEqual([
      expect.objectContaining({
        id: "hymne-001",
        assetCode: "HYMNE",
        book: "english",
        number: 1,
        title: "Holy, Holy, Holy",
        pdfPage: 5,
        pdfPages: 1,
      }),
    ]);
  });

  it("rejects malformed optional hymn metadata before activation", () => {
    expect(() =>
      normalizeDistributedHymnIndex("HYMNE", [
        { number: "001", title: "Broken", verses: [] },
      ]),
    ).toThrow("Invalid HYMNE hymn");
  });
});
