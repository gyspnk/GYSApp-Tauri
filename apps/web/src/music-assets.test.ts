// @ts-nocheck - this DOM-typed package reads generated JSON through Node builtins.
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { HymnCatalogEntry, UpstreamMusicLock } from "@gys/contracts";
import { findMusicAsset } from "./music-assets.js";

const catalog = JSON.parse(
  readFileSync(
    new URL("../public/offline/hymn-catalog.json", import.meta.url),
    "utf8",
  ),
) as { items: HymnCatalogEntry[] };
const lock = JSON.parse(
  readFileSync(
    new URL("../public/offline/music-lock.json", import.meta.url),
    "utf8",
  ),
) as UpstreamMusicLock;
const chordManifest = JSON.parse(
  readFileSync(
    new URL(
      "../../../packages/contracts/generated/chord-manifest.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const chordAudit = JSON.parse(
  readFileSync(
    new URL(
      "../../../docs/discovery/chord-position-audit.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
const assetManifest = JSON.parse(
  readFileSync(
    new URL("../public/offline/asset-manifest.json", import.meta.url),
    "utf8",
  ),
);

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

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

  it("resolves a canonical number-only MIDI filename", () => {
    const lock = {
      sourceRepo: "gyspnk/gyschordweb",
      sourceCommit: "a3d1ea7",
      generatedAt: "2026-08-14T00:00:00.000Z",
      items: [
        {
          id: "midi-416",
          kind: "midi" as const,
          path: "assets/midi/416.MID",
          size: 1,
          sha256: "b".repeat(64),
        },
      ],
    };
    expect(
      findMusicAsset(
        lock,
        "midi",
        'assets/midi/416_"Kau Sanggupkah?" Tanya Yesus.mid',
      )?.id,
    ).toBe("midi-416");
  });

  it("maps every generated hymn to its locked MIDI and PDF assets", () => {
    const missing = catalog.items.flatMap((hymn) => [
      ...(!findMusicAsset(lock, "midi", hymn.midiPath)
        ? [`${hymn.id} MIDI`]
        : []),
      ...(!findMusicAsset(lock, "pdf", hymn.pdfPath) ? [`${hymn.id} PDF`] : []),
    ]);
    expect(missing).toEqual([]);
  });

  it("audits chord geometry against the exact locked PDF and chord bytes", () => {
    expect(chordManifest.sourceCommit).toBe(lock.sourceCommit);
    expect(chordAudit.sourceCommit).toBe(lock.sourceCommit);
    expect(chordAudit.files.map((file: any) => file.songId).sort()).toEqual(
      chordManifest.entries.map((entry: any) => entry.songId).sort(),
    );
    const mismatches = chordAudit.files.flatMap((audit: any) => {
      const chordRef = chordManifest.entries.find(
        (entry: any) => entry.songId === audit.songId,
      );
      const hymn = catalog.items.find((item) => item.id === audit.songId);
      const pdfRef = findMusicAsset(lock, "pdf", audit.pdfPath);
      return !chordRef ||
        !hymn ||
        !pdfRef ||
        hymn.chordRef?.path !== audit.chordPath ||
        chordRef.path !== audit.chordPath ||
        chordRef.size !== audit.chordBytes ||
        chordRef.sha256 !== audit.chordSha256 ||
        pdfRef.path !== audit.pdfPath ||
        pdfRef.size !== audit.pdfBytes ||
        pdfRef.sha256 !== audit.pdfSha256
        ? [audit.songId]
        : [];
    });
    expect(mismatches).toEqual([]);
  });
});

describe("persistent music asset cache", () => {
  it("bounds cached PDFs to 16 MiB without evicting MIDI assets", async () => {
    const cached = new Map<string, Response>();
    const keyOf = (request: Request | string) =>
      typeof request === "string"
        ? new URL(request, "https://cache.test").href
        : request.url;
    const cache = {
      match: async (request: Request | string) =>
        cached.get(keyOf(request))?.clone(),
      put: async (request: Request | string, response: Response) => {
        cached.set(keyOf(request), response.clone());
      },
      delete: async (request: Request | string) =>
        cached.delete(keyOf(request)),
      keys: async () => [...cached.keys()].map((url) => new Request(url)),
    };
    const cacheStorage = {
      open: async () => cache,
      delete: async () => cached.clear(),
    };
    const digest = new Uint8Array(32).fill(0xab).buffer;
    const bytesPerPdf = 1024 * 1024;
    const pdfCount = 18;
    const midiTemplate = lock.items.find((item) => item.kind === "midi")!;
    const pdfTemplate = lock.items.find((item) => item.kind === "pdf")!;
    const testItems = [
      {
        ...midiTemplate,
        id: "midi-keep",
        path: "__cache_test__/keep.mid",
        size: 1,
        sha256: "ab".repeat(32),
      },
      ...Array.from({ length: pdfCount }, (_, index) => ({
        ...pdfTemplate,
        id: `pdf-cache-${index}`,
        path: `__cache_test__/pdf-${index}.pdf`,
        size: bytesPerPdf,
        sha256: "ab".repeat(32),
      })),
    ];
    const testLock = { ...lock, items: testItems };
    const payload = new Uint8Array(bytesPerPdf).fill(7);
    vi.stubGlobal("caches", cacheStorage);
    vi.stubGlobal("window", {
      caches: cacheStorage,
      location: { origin: "https://cache.test" },
    });
    vi.stubGlobal("crypto", { subtle: { digest: async () => digest } });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith("offline/asset-manifest.json"))
          return new Response(JSON.stringify(assetManifest));
        if (url.endsWith("offline/music-lock.json"))
          return new Response(JSON.stringify(testLock));
        if (url.startsWith("https://raw.githubusercontent.com/")) {
          const assetBytes = url.endsWith(".pdf")
            ? payload.slice()
            : new Uint8Array([7]);
          return new Response(assetBytes, {
            headers: {
              "content-type": url.endsWith(".pdf")
                ? "application/pdf"
                : "application/octet-stream",
            },
          });
        }
        throw new Error(`Unexpected request: ${url}`);
      }),
    );

    vi.resetModules();
    const { loadMusicAsset, musicAssetStats } =
      await import("./music-assets.js");
    for (const item of testItems) await loadMusicAsset(item);

    const pdfUrl = (index: number) =>
      `https://raw.githubusercontent.com/gyspnk/gyschordweb/${encodeURIComponent(lock.sourceCommit)}/docs/__cache_test__/pdf-${index}.pdf`;
    expect(cached.has(pdfUrl(0))).toBe(false);
    expect(cached.has(pdfUrl(pdfCount - 1))).toBe(true);
    expect(
      cached.has(
        `https://raw.githubusercontent.com/gyspnk/gyschordweb/${encodeURIComponent(lock.sourceCommit)}/docs/__cache_test__/keep.mid`,
      ),
    ).toBe(true);
    await expect(musicAssetStats()).resolves.toEqual({
      entries: 17,
      bytes: 16 * bytesPerPdf + 1,
    });
  });
});
