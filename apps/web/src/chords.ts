import {
  ChordRepository,
  type ChordFetchResult,
  type ChordUpstream,
} from "@gys/domain";
import type { ChordRef, ChordManifestV1 } from "@gys/contracts";
import { ChordManifestV1Schema } from "@gys/contracts";
import { BrowserChordCache } from "./chord-cache.js";
import { createPlatformServices } from "./platform.js";

const RAW_ROOT = "https://raw.githubusercontent.com/gyspnk/gyschordweb";

function bffUrl(path: string): string | undefined {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return base ? `${base.replace(/\/$/, "")}${path}` : undefined;
}

async function fallbackManifest(): Promise<{ manifest: ChordManifestV1 }> {
  const lockResponse = await fetch(
    `${import.meta.env.BASE_URL}offline/music-lock.json`,
    { cache: "no-cache" },
  );
  if (!lockResponse.ok) throw new Error("offline music lock unavailable");
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

export function createBrowserChordRepository(): ChordRepository {
  const upstream: ChordUpstream = {
    async getManifest(etag, signal) {
      const endpoint = bffUrl("/api/v1/chords/manifest");
      if (!endpoint) return fallbackManifest();
      const response = await fetch(
        endpoint,
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
        return fallbackManifest();
      }
      const nextEtag = response.headers.get("etag");
      return {
        manifest: ChordManifestV1Schema.parse(await response.json()),
        ...(nextEtag ? { etag: nextEtag } : {}),
      };
    },
    async fetchChord(ref: ChordRef, signal): Promise<ChordFetchResult> {
      const encodedPath = ref.path
        .replace(/^docs\//, "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
      const candidates = [
        base
          ? `${base.replace(/\/$/, "")}/api/v1/content/music?commit=${encodeURIComponent(ref.sourceCommit)}&path=${encodeURIComponent(ref.path)}`
          : undefined,
        `${RAW_ROOT}/${encodeURIComponent(ref.sourceCommit)}/docs/${encodedPath}`,
      ].filter((value): value is string => Boolean(value));
      let lastError: unknown;
      for (const url of candidates) {
        try {
          const response = await fetch(
            url,
            signal
              ? { signal, cache: "force-cache" }
              : { cache: "force-cache" },
          );
          if (!response.ok)
            throw new Error(`chord request failed: ${response.status}`);
          const bytes = new Uint8Array(await response.arrayBuffer());
          return {
            bytes,
            document: JSON.parse(new TextDecoder().decode(bytes)) as unknown,
          };
        } catch (error) {
          if (signal?.aborted) throw error;
          lastError = error;
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new Error("chord request failed");
    },
  };
  return new ChordRepository(
    upstream,
    new BrowserChordCache(createPlatformServices()),
  );
}
