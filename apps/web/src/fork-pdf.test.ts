import { describe, expect, it } from "vitest";
import {
  forkManifestSongKey,
  forkPdfSourceUrls,
  resolveForkPdfSource,
} from "./fork-pdf.js";

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

  it("falls back to the raw PDF when the configured proxy is unavailable", async () => {
    const sources = [
      "https://worker.example/fork.pdf",
      "https://raw.example/fork.pdf",
    ];
    const requested: string[] = [];
    const source = await resolveForkPdfSource(sources, async (input) => {
      requested.push(String(input));
      if (requested.length === 1)
        return new Response("proxy unavailable", { status: 502 });
      return new Response(new Uint8Array([37, 80, 68, 70, 45]), {
        status: 206,
        headers: { "content-type": "application/octet-stream" },
      });
    });

    expect(source).toBe(sources[1]);
    expect(requested).toEqual(sources);
  });
});
