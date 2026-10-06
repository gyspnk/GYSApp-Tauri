import { afterEach, describe, expect, it, vi } from "vitest";
import {
  forkManifestSongKey,
  forkPdfSourceUrls,
  resolveForkPdfSource,
} from "./fork-pdf.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

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

  it("evicts a corrupt cached package and downloads a valid replacement", async () => {
    vi.resetModules();
    const pdfBytes = new TextEncoder().encode("%PDF-1.7\nverified master");
    const digest = await crypto.subtle.digest("SHA-256", pdfBytes);
    const pdfSha = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const manifest = {
      sourceRepo: "ThenGB/GYSAPP-Fork",
      sourceCommit: "4f0d39b",
      generatedAt: "2026-08-14T00:00:00.000Z",
      bookCode: "KR",
      masterPath: "assets/data/pdf/kr/kr_master.pdf",
      pageCount: 649,
      sizeBytes: pdfBytes.byteLength,
      sha256: pdfSha,
      songs: { "001": { startPage: 5, pageCount: 1, source: "001.pdf" } },
    };
    const packageUrl =
      "https://github.com/ThenGB/GYSApp-Data/releases/download/hymnals-2026.05.21/kr.gyspkg";
    const cacheEntries = new Map<string, Response>([
      [packageUrl, new Response("partial package")],
    ]);
    const cache = {
      match: vi.fn(async (url: string) => cacheEntries.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => {
        cacheEntries.set(url, response.clone());
      }),
      delete: vi.fn(async (url: string) => cacheEntries.delete(url)),
    };
    const requests: string[] = [];
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/offline/fork-hymnal-manifest.json"))
          return new Response(JSON.stringify(manifest));
        if (url.includes("speech")) throw new Error("Unexpected request");
        if (
          url ===
          "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/pdf/kr/kr_master.pdf"
        )
          return new Response("source unavailable", { status: 502 });
        if (
          url ===
          "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/hymnals-manifest.json"
        )
          return new Response(
            JSON.stringify({
              track: "hymnals",
              releaseTag: "hymnals-2026.05.21",
              publishedAt: "2026-05-21T00:00:00.000Z",
              packages: [
                {
                  code: "KR",
                  version: "2026.05.21",
                  fileName: "kr.gyspkg",
                  downloadUrl: packageUrl,
                  installFileName: "kr_master.pdf",
                  sizeBytes: pdfBytes.byteLength,
                  checksumSha256: pdfSha,
                },
              ],
            }),
          );
        if (url === packageUrl) return new Response(pdfBytes);
        return new Response("not found", { status: 404 });
      }),
    );

    const { loadForkHymnalPdfBytes } = await import("./fork-pdf.js");
    const result = await loadForkHymnalPdfBytes("001");

    expect([...result.bytes]).toEqual([...pdfBytes]);
    expect(requests).toContain(packageUrl);
    expect(cache.delete).toHaveBeenCalledWith(packageUrl);
    expect(cache.put).toHaveBeenCalledWith(packageUrl, expect.any(Response));
    expect(cache.put).toHaveBeenCalledWith(
      "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/hymnals-manifest.json",
      expect.any(Response),
    );
  });

  it("loads a verified cached KR package when offline", async () => {
    vi.resetModules();
    const pdfBytes = new TextEncoder().encode("%PDF-1.7\nverified master");
    const digest = await crypto.subtle.digest("SHA-256", pdfBytes);
    const pdfSha = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const manifestUrl =
      "https://raw.githubusercontent.com/ThenGB/GYSApp-Data/main/latest/hymnals-manifest.json";
    const packageUrl =
      "https://github.com/ThenGB/GYSApp-Data/releases/download/hymnals-2026.05.21/kr.gyspkg";
    const release = {
      track: "hymnals",
      releaseTag: "hymnals-2026.05.21",
      publishedAt: "2026-05-21T00:00:00.000Z",
      packages: [
        {
          code: "KR",
          version: "2026.05.21",
          fileName: "kr.gyspkg",
          downloadUrl: packageUrl,
          installFileName: "kr_master.pdf",
          sizeBytes: pdfBytes.byteLength,
          checksumSha256: pdfSha,
        },
      ],
    };
    const cacheEntries = new Map<string, Response>([
      [manifestUrl, new Response(JSON.stringify(release))],
      [packageUrl, new Response(pdfBytes)],
    ]);
    const cache = {
      match: vi.fn(async (url: string) => cacheEntries.get(url)?.clone()),
      put: vi.fn(async (url: string, response: Response) => {
        cacheEntries.set(url, response.clone());
      }),
      delete: vi.fn(async (url: string) => cacheEntries.delete(url)),
    };
    const requests: string[] = [];
    vi.stubGlobal("caches", { open: vi.fn(async () => cache) });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        requests.push(url);
        if (url.endsWith("/offline/fork-hymnal-manifest.json"))
          return new Response(
            JSON.stringify({
              sourceRepo: "ThenGB/GYSAPP-Fork",
              sourceCommit: "4f0d39b",
              generatedAt: "2026-08-14T00:00:00.000Z",
              bookCode: "KR",
              masterPath: "assets/data/pdf/kr/kr_master.pdf",
              pageCount: 649,
              sizeBytes: pdfBytes.byteLength,
              sha256: pdfSha,
              songs: {
                "001": { startPage: 5, pageCount: 1, source: "001.pdf" },
              },
            }),
          );
        throw new TypeError(`offline: ${url}`);
      }),
    );

    const { loadForkHymnalPdfBytes } = await import("./fork-pdf.js");
    const result = await loadForkHymnalPdfBytes("001");

    expect([...result.bytes]).toEqual([...pdfBytes]);
    expect(requests).toContain(manifestUrl);
    expect(requests).not.toContain(packageUrl);
  });
});

it("neighboring scores share one immutable source probe", async () => {
  vi.resetModules();
  const manifest = {
    sourceRepo: "ThenGB/GYSAPP-Fork",
    sourceCommit: "4f0d39b",
    generatedAt: "2026-08-14T00:00:00.000Z",
    bookCode: "KR",
    masterPath: "assets/data/pdf/kr/kr_master.pdf",
    pageCount: 649,
    songs: {
      "001": { startPage: 5, pageCount: 1, source: "001.pdf" },
      "002": { startPage: 6, pageCount: 1, source: "002.pdf" },
    },
  };
  const request = vi.fn(async (input: RequestInfo | URL) =>
    String(input).includes("offline/")
      ? new Response(JSON.stringify(manifest))
      : new Response("%PDF-", { status: 206 }),
  );
  vi.stubGlobal("fetch", request);
  const { loadForkHymnalPdf } = await import("./fork-pdf.js");
  const [first, second] = await Promise.all([
    loadForkHymnalPdf(1),
    loadForkHymnalPdf(2),
  ]);
  expect(first.src).toBe(second.src);
  expect([first.initialPage, second.initialPage]).toEqual([5, 6]);
  await loadForkHymnalPdf(1);
  expect(
    request.mock.calls.filter(([input]) => !String(input).includes("offline/")),
  ).toHaveLength(1);
});
