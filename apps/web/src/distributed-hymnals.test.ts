import { describe, expect, it } from "vitest";
import { loadDistributedHymnCatalog } from "./distributed-hymnals.js";

describe("distributed hymnal catalog", () => {
  it("parses Fork metadata for optional hymnals", async () => {
    const items = await loadDistributedHymnCatalog(
      async () =>
        new Response(
          JSON.stringify({
            version: 1,
            sourceRepo: "ThenGB/GYSAPP-Fork",
            sourceCommit: "4f0d39b",
            generatedAt: "2026-08-18T00:00:00.000Z",
            catalogs: [
              {
                code: "HYMNE",
                title: "Hymne (English Version)",
                items: [
                  {
                    id: "hymne-001",
                    assetCode: "HYMNE",
                    book: "english",
                    number: 1,
                    title: "Holy, Holy, Holy",
                    verses: ["Holy, holy, holy"],
                    lyrics: "Holy, holy, holy",
                    midiPath: "assets/midi/kr/001_Pujilah.mid",
                    pdfPath: "assets/data/pdf/hymne/001_Holy.pdf",
                    pdfPage: 5,
                    pdfPages: 1,
                  },
                ],
              },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
    );

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      assetCode: "HYMNE",
      book: "english",
      pdfPage: 5,
      pdfPages: 1,
    });
  });
});
