import { describe, expect, it } from "vitest";
import {
  fillMissingHymnPages,
  normalizeDistributedHymnIndex,
} from "./distributed-hymnals.js";

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

describe("missing hymnal pages", () => {
  const hymn = (number: string, page?: number, pages?: number) => ({
    number,
    title: `Hymn ${number}`,
    verses: ["verse"],
    pdfFile: `pdf/mdr/${number}.pdf`,
    ...(page === undefined ? {} : { page }),
    ...(pages === undefined ? {} : { pages }),
  });

  it("fills a single unmapped song between two mapped ones", () => {
    const items = normalizeDistributedHymnIndex("MDR", [
      hymn("001", 17),
      hymn("002", 18),
      hymn("003"),
      hymn("004", 20),
    ]);
    expect(items.map((item) => item.pdfPage)).toEqual([17, 18, 19, 20]);
    expect(items[2]).toMatchObject({ pdfPage: 19, pdfPages: 1 });
  });

  it("fills a run only when the pages between the neighbours fit exactly", () => {
    const roomy = fillMissingHymnPages([
      { pdfPage: 10 },
      {},
      {},
      { pdfPage: 14 },
    ]);
    expect(roomy.map((entry) => entry.pdfPage)).toEqual([10, 11, 12, 14]);

    const crowded = fillMissingHymnPages([
      { pdfPage: 10 },
      {},
      { pdfPage: 11 },
      {},
      { pdfPage: 12 },
    ]);
    expect(crowded[1]?.pdfPage).toBeUndefined();
    expect(crowded[3]?.pdfPage).toBeUndefined();
  });

  it("leaves trailing songs and songs before the first map untouched", () => {
    const items = fillMissingHymnPages([{}, { pdfPage: 4 }, {}, {}]);
    expect(items[0]?.pdfPage).toBeUndefined();
    expect(items[2]?.pdfPage).toBeUndefined();
    expect(items[3]?.pdfPage).toBeUndefined();
  });

  it("gives a mapped song with an unknown length one page", () => {
    expect(fillMissingHymnPages([{ pdfPage: 7 }])[0]).toMatchObject({
      pdfPage: 7,
      pdfPages: 1,
    });
  });

  it("does not mutate the entries it is given", () => {
    const source = [{ pdfPage: 3 }, {}];
    const filled = fillMissingHymnPages(source);
    expect(source[0]).toEqual({ pdfPage: 3 });
    expect(filled).not.toBe(source);
  });
});
