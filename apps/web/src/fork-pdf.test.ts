import { describe, expect, it } from "vitest";
import { forkManifestSongKey, forkPdfSourceUrls } from "./fork-pdf.js";

describe("GYSApp-Fork hymn PDF mapping", () => {
  it("preserves suffixed hymn identities from the source database", () => {
    expect(forkManifestSongKey("hymn-051A")).toBe("051A");
    expect(forkManifestSongKey("124b")).toBe("124B");
    expect(forkManifestSongKey(1)).toBe("001");
  });

  it("resolves immutable fork sources without downloading the master PDF", () => {
    const manifest = {
      sourceRepo: "ThenGB/GYSAPP-Fork",
      sourceCommit: "4f0d39b",
      masterPath: "assets/data/pdf/kr/kr_master.pdf",
    };
    expect(forkPdfSourceUrls(manifest, "https://worker.example")).toEqual([
      "https://worker.example/api/v1/content/fork-pdf?commit=4f0d39b&path=assets%2Fdata%2Fpdf%2Fkr%2Fkr_master.pdf",
      "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/pdf/kr/kr_master.pdf",
    ]);
  });
});
