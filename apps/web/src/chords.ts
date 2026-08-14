import {
  ChordRepository,
  type ChordFetchResult,
  type ChordUpstream,
} from "@gys/domain";
import type { ChordRef, ChordManifestV1 } from "@gys/contracts";
import { ChordManifestV1Schema } from "@gys/contracts";
import { BrowserChordCache } from "./chord-cache.js";
import { createBrowserPlatformServices } from "./platform.js";

const RAW_ROOT = "https://raw.githubusercontent.com/gyspnk/gyschordweb";

function bffUrl(path: string): string {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return base
    ? `${base.replace(/\/$/, "")}${path}`
    : `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}`;
}

export function createBrowserChordRepository(): ChordRepository {
  const upstream: ChordUpstream = {
    async getManifest(etag, signal) {
      const response = await fetch(
        bffUrl("/api/v1/chords/manifest"),
        signal
          ? {
              signal,
              ...(etag ? { headers: { "if-none-match": etag } } : {}),
            }
          : etag
            ? { headers: { "if-none-match": etag } }
            : {},
      );
      if (response.status === 304 && etag)
        return {
          notModified: true,
          etag,
        };
      if (
        !response.ok ||
        !response.headers.get("content-type")?.includes("json")
      ) {
        // GitHub Pages has no same-origin Worker; derive the immutable manifest
        // from the checked-in music lock so chord view remains functional.
        const lockResponse = await fetch(
          `${import.meta.env.BASE_URL}offline/music-lock.json`,
          { cache: "no-cache" },
        );
        if (!lockResponse.ok)
          throw new Error(`manifest request failed: ${response.status}`);
        const lock = (await lockResponse.json()) as {
          sourceCommit: string;
          generatedAt: string;
          items: Array<{
            id: string;
            kind: string;
            path: string;
            size: number;
            sha256: string;
          }>;
        };
        return {
          manifest: {
            version: 1,
            sourceRepo: "gyspnk/gyschordweb",
            sourceCommit: lock.sourceCommit,
            generatedAt: lock.generatedAt,
            entries: lock.items
              .filter((item) => item.kind === "chord")
              .map((item) => ({
                songId: `hymn-${(item.path.match(/\/(\d+)_/)?.[1] ?? "0").padStart(3, "0")}`,
                path: item.path,
                sourceCommit: lock.sourceCommit,
                size: item.size,
                sha256: item.sha256,
              })),
          },
        };
      }
      const nextEtag = response.headers.get("etag");
      return {
        manifest: ChordManifestV1Schema.parse(await response.json()),
        ...(nextEtag ? { etag: nextEtag } : {}),
      };
    },
    async fetchChord(ref: ChordRef, signal): Promise<ChordFetchResult> {
      const response = await fetch(
        `${RAW_ROOT}/${ref.sourceCommit}/docs/${ref.path}`,
        signal ? { signal, cache: "force-cache" } : { cache: "force-cache" },
      );
      if (!response.ok)
        throw new Error(`chord request failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      return {
        bytes,
        document: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
      };
    },
  };
  return new ChordRepository(
    upstream,
    new BrowserChordCache(createBrowserPlatformServices()),
  );
}
