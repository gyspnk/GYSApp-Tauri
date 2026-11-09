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

  it("keeps each Aku Senang Menyanyi volume a separate book", () => {
    const entry = {
      number: "007",
      title: "Tuhan Yesus Sahabatku",
      verses: ["Tuhan Yesus sahabatku"],
      pdfFile: "pdf/asm_i/007.pdf",
    } as const;
    for (const code of ["ASM-I", "ASM-P", "ASM-M"] as const) {
      const [item] = normalizeDistributedHymnIndex(code, [entry]);
      expect(item).toMatchObject({
        assetCode: code,
        book: code,
        midiPath: expect.stringContaining("asm_"),
      });
    }
  });

  it("rejects malformed optional hymn metadata before activation", () => {
    expect(() =>
      normalizeDistributedHymnIndex("HYMNE", [
        { number: "001", title: "Broken", verses: [] },
      ]),
    ).toThrow("Invalid HYMNE hymn");
  });
});
