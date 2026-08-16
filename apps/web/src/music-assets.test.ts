import { describe, expect, it } from "vitest";
import { findMusicAsset } from "./music-assets.js";

describe("music asset path resolution", () => {
  it("resolves upstream filename whitespace and suffixed hymn keys", () => {
    const lock = {
      sourceRepo: "gyspnk/gyschordweb",
      sourceCommit: "a3d1ea7",
      generatedAt: "2026-08-14T00:00:00.000Z",
      items: [
        {
          id: "pdf-051A",
          kind: "pdf" as const,
          path: "assets/pdf/051A_Batu Zaman.pdf",
          size: 1,
          sha256: "a".repeat(64),
        },
      ],
    };
    expect(
      findMusicAsset(lock, "pdf", "assets/pdf/051A_ Batu Zaman.pdf")?.id,
    ).toBe("pdf-051A");
  });
});
