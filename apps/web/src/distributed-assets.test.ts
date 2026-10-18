import { describe, expect, it, vi } from "vitest";
import {
  loadDistributedAssetCatalog,
  normalizeDistributedManifests,
  parseDistributedAssetCatalog,
} from "./distributed-assets.js";

const pkg = {
  code: "b_kjv",
  version: "2026.05.21",
  fileName: "b_kjv.gyspkg",
  downloadUrl:
    "https://github.com/ThenGB/GYSApp-Data/releases/download/bibles-2026.05.21/b_kjv.gyspkg",
  installFileName: "b_kjv.db",
  sizeBytes: 1_935_399,
  checksumSha256: "a".repeat(64),
};

function rawManifest(
  track: "bibles" | "hymnals" | "soundfont",
  packages = [pkg],
) {
  return {
    track,
    releaseTag: `${track}-2026.05.21`,
    publishedAt: "2026-05-21T06:43:39.809321Z",
    packages,
  };
}

describe("distributed asset catalog", () => {
  it("normalizes GYSApp-Data track manifests into supported asset rows", () => {
    const catalog = normalizeDistributedManifests({
      bibles: rawManifest("bibles"),
      hymnals: rawManifest("hymnals", [
        {
          ...pkg,
          code: "HYMNE",
          fileName: "hymne.gyspkg",
          installFileName: "hymne_master.pdf",
          downloadUrl:
            "https://github.com/ThenGB/GYSApp-Data/releases/download/hymnals-2026.05.21/hymne.gyspkg",
        },
      ]),
      soundfont: rawManifest("soundfont", [
        {
          ...pkg,
          code: "GeneralUser-GS",
          fileName: "GeneralUser-GS.sf2",
          installFileName: "GeneralUser-GS.sf2",
          downloadUrl:
            "https://github.com/ThenGB/GYSApp-Data/releases/download/soundfont-2026.06.30/GeneralUser-GS.sf2",
        },
      ]),
    });

    expect(catalog.sourceRepo).toBe("ThenGB/GYSApp-Data");
    expect(catalog.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "b_kjv",
          kind: "bible",
          bundledByDefault: false,
        }),
        expect.objectContaining({
          code: "HYMNE",
          kind: "hymnal",
          title: "Hymne (English Version)",
        }),
        expect.objectContaining({
          code: "GeneralUser-GS",
          kind: "soundfont",
        }),
      ]),
    );
  });

  it("rejects duplicate distributed codes before activation", () => {
    expect(() =>
      normalizeDistributedManifests({
        bibles: rawManifest("bibles", [pkg, pkg]),
        hymnals: rawManifest("hymnals", []),
        soundfont: rawManifest("soundfont", []),
      }),
    ).toThrow("Duplicate distributed asset code: b_kjv");
  });

  it("rejects package URLs outside the GYSApp-Data release path", () => {
    expect(() =>
      normalizeDistributedManifests({
        bibles: rawManifest("bibles", [
          { ...pkg, downloadUrl: "https://evil.example/package.gyspkg" },
        ]),
        hymnals: rawManifest("hymnals", []),
        soundfont: rawManifest("soundfont", []),
      }),
    ).toThrow("Untrusted distributed asset URL");
  });

  it("falls back to the bundled catalog when runtime manifests fail", async () => {
    const fallback = {
      version: 1,
      generatedAt: "2026-06-30T00:00:00.000Z",
      sourceRepo: "ThenGB/GYSApp-Data",
      items: [
        {
          kind: "bible",
          code: "b_kjv",
          title: "King James Version",
          track: "bibles",
          bundledByDefault: false,
          version: "2026.05.21",
          releaseTag: "bibles-2026.05.21",
          fileName: "b_kjv.gyspkg",
          downloadUrl: pkg.downloadUrl,
          installFileName: "b_kjv.db",
          sizeBytes: pkg.sizeBytes,
          checksumSha256: pkg.checksumSha256,
        },
      ],
    };
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));

    const catalog = await loadDistributedAssetCatalog({
      fetcher,
      fallback,
      urls: {
        bibles: "https://manifest.example/bibles.json",
        hymnals: "https://manifest.example/hymnals.json",
        soundfont: "https://manifest.example/soundfont.json",
      },
    });

    expect(catalog.items[0]?.code).toBe("b_kjv");
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("validates a checked-in catalog snapshot", () => {
    expect(() =>
      parseDistributedAssetCatalog({
        version: 1,
        generatedAt: "2026-06-30T00:00:00.000Z",
        sourceRepo: "ThenGB/GYSApp-Data",
        items: [],
      }),
    ).not.toThrow();
  });

  it("retires stalled remote manifests and recovers through the bundled snapshot", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    const fallback = {
      version: 1,
      generatedAt: "2026-06-30T00:00:00.000Z",
      sourceRepo: "ThenGB/GYSApp-Data",
      items: [],
    };
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      if (init?.signal) signals.push(init.signal);
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        );
      });
    });
    try {
      const loading = loadDistributedAssetCatalog({ fetcher, fallback });
      await vi.advanceTimersByTimeAsync(8_000);
      await expect(
        Promise.race([loading, Promise.resolve("still pending")]),
      ).resolves.toEqual(fallback);
      expect(signals).toHaveLength(3);
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cancels remaining manifest probes when one source fails immediately", async () => {
    const signals: AbortSignal[] = [];
    const fallback = {
      version: 1,
      generatedAt: "2026-06-30T00:00:00.000Z",
      sourceRepo: "ThenGB/GYSApp-Data",
      items: [],
    };
    let calls = 0;
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      if (init?.signal) signals.push(init.signal);
      if (calls++ === 0) return Promise.reject(new Error("offline"));
      return new Promise((_resolve, reject) =>
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason),
          { once: true },
        ),
      );
    });
    await expect(
      loadDistributedAssetCatalog({ fetcher, fallback }),
    ).resolves.toEqual(fallback);
    expect(signals).toHaveLength(3);
    expect(signals.every((signal) => signal.aborted)).toBe(true);
  });
});
