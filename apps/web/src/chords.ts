import {
  ChordRepository,
  type ChordFetchResult,
  type ChordUpstream,
} from "@gys/domain";
import type { ChordRef, ChordManifestV1 } from "@gys/contracts";
import { ChordManifestV1Schema } from "@gys/contracts";
import { BrowserChordCache } from "./chord-cache.js";
import { createPlatformServices } from "./platform.js";
import { recordDiagnostic } from "./diagnostics.js";
import { loadMusicLock } from "./music-assets.js";

const RAW_ROOT = "https://raw.githubusercontent.com/gyspnk/gyschordweb";

function bffUrl(path: string): string | undefined {
  const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
  return base ? `${base.replace(/\/$/, "")}${path}` : undefined;
}

async function fallbackManifest(): Promise<{ manifest: ChordManifestV1 }> {
  const lock = await loadMusicLock();
  return {
    manifest: {
      version: 1,
      sourceRepo: "gyspnk/gyschordweb",
      sourceCommit: lock.sourceCommit,
      generatedAt: lock.generatedAt,
      entries: lock.items
        .filter((item) => item.kind === "chord")
        .map((item) => {
          return {
            songId: chordSongIdFromPath(item.path),
            path: item.path,
            sourceCommit: lock.sourceCommit,
            size: item.size,
            sha256: item.sha256,
          };
        }),
    },
  };
}

export function chordSongIdFromPath(path: string): string {
  const key = path.match(/\/(\d{3}[a-z]?)_/i)?.[1];
  return `hymn-${key?.toUpperCase() ?? "000"}`;
}

function newBrowserChordRepository(): ChordRepository {
  const platform = createPlatformServices();
  let savedManifest: Promise<ChordManifestV1 | undefined> | undefined;
  const loadSavedManifest = () =>
    (savedManifest ??= platform.keyValue
      .get("gys-latest-chord-manifest-v1")
      .then((saved) => {
        const parsed = ChordManifestV1Schema.safeParse(saved);
        return parsed.success ? parsed.data : undefined;
      })
      .catch(() => undefined));
  const upstream: ChordUpstream = {
    async getManifest(etag, signal) {
      const saved = await loadSavedManifest();
      const timeout = AbortSignal.timeout(6000);
      const requestSignal = signal
        ? AbortSignal.any([signal, timeout])
        : timeout;
      try {
        const response = await fetch(
          `${RAW_ROOT}/main/docs/assets-chord-manifest.json`,
          // Browser HTTP cache handles conditional validation without a CORS
          // preflight: raw GitHub rejects explicit If-None-Match preflights.
          { cache: "no-cache", signal: requestSignal },
        );
        if (response.status === 304 && saved) return { manifest: saved };
        if (!response.ok) throw new Error("Latest chord manifest unavailable");
        const raw = (await response.json()) as {
          schemaVersion: number;
          sourceCommit: string;
          files: Array<{
            bookCode: string;
            path: string;
            size: number;
            sha256: string;
          }>;
        };
        if (raw.schemaVersion !== 1 || !Array.isArray(raw.files))
          throw new Error("Invalid chord manifest");
        const manifest = ChordManifestV1Schema.parse({
          version: 1,
          sourceRepo: "gyspnk/gyschordweb",
          sourceCommit: raw.sourceCommit,
          generatedAt: new Date().toISOString(),
          entries: raw.files
            .filter((file) => file.bookCode === "KR")
            .map((file) => {
              if (
                !/^docs\/assets\/chord\/\d{3}[a-z]?_[^/]+\.chord\.json$/i.test(
                  file.path,
                )
              )
                throw new Error("Invalid chord source path");
              return {
                songId: chordSongIdFromPath(file.path),
                path: file.path,
                sourceCommit: raw.sourceCommit,
                size: file.size,
                sha256: file.sha256,
              };
            }),
        });
        if (
          !manifest.entries.length ||
          new Set(manifest.entries.map((entry) => entry.songId)).size !==
            manifest.entries.length
        )
          throw new Error("Incomplete chord manifest");
        const unchanged =
          saved?.sourceCommit === manifest.sourceCommit &&
          saved.entries.length === manifest.entries.length &&
          saved.entries.every((entry, index) => {
            const next = manifest.entries[index]!;
            return (
              entry.songId === next.songId &&
              entry.path === next.path &&
              entry.sha256 === next.sha256 &&
              entry.size === next.size
            );
          });
        if (!unchanged) {
          // Disk availability must not turn a valid live manifest into a failure.
          await platform.keyValue
            .set("gys-latest-chord-manifest-v1", manifest)
            .catch(() => undefined);
          savedManifest = Promise.resolve(manifest);
        }
        return { manifest: unchanged ? saved : manifest };
      } catch (error) {
        if (signal?.aborted) throw error;
        if (saved) return { manifest: saved };
      }
      const endpoint = bffUrl("/api/v1/chords/manifest");
      if (!endpoint) return fallbackManifest();
      try {
        const fallbackTimeout = AbortSignal.timeout(4000);
        const response = await fetch(endpoint, {
          signal: signal
            ? AbortSignal.any([signal, fallbackTimeout])
            : fallbackTimeout,
          ...(etag ? { headers: { "if-none-match": etag } } : {}),
        });
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
        const manifest = ChordManifestV1Schema.parse(await response.json());
        const musicLock = await loadMusicLock();
        const lockedChords = new Map(
          musicLock.items
            .filter((item) => item.kind === "chord")
            .map((item) => [item.path, item]),
        );
        if (
          manifest.sourceRepo !== musicLock.sourceRepo ||
          manifest.sourceCommit !== musicLock.sourceCommit ||
          manifest.entries.length !== lockedChords.size ||
          new Set(manifest.entries.map((entry) => entry.path)).size !==
            lockedChords.size ||
          manifest.entries.some((entry) => {
            const locked = lockedChords.get(entry.path);
            return (
              !locked ||
              entry.songId !== chordSongIdFromPath(entry.path) ||
              entry.sourceCommit !== musicLock.sourceCommit ||
              entry.size !== locked.size ||
              entry.sha256.toLowerCase() !== locked.sha256.toLowerCase()
            );
          })
        )
          return fallbackManifest();
        return {
          manifest,
          ...(nextEtag ? { etag: nextEtag } : {}),
        };
      } catch (error) {
        if (signal?.aborted) throw error;
        return fallbackManifest();
      }
    },
    async fetchChord(ref: ChordRef, signal): Promise<ChordFetchResult> {
      const encodedPath = ref.path
        .replace(/^docs\//, "")
        .split("/")
        .map((segment) => encodeURIComponent(segment))
        .join("/");
      const base = import.meta.env.VITE_BFF_BASE_URL?.trim();
      const lock = base
        ? await loadMusicLock().catch(() => undefined)
        : undefined;
      const candidates = [
        base && lock?.sourceCommit === ref.sourceCommit
          ? `${base.replace(/\/$/, "")}/api/v1/content/music?commit=${encodeURIComponent(ref.sourceCommit)}&path=${encodeURIComponent(ref.path.replace(/^docs\//, ""))}`
          : undefined,
        `${RAW_ROOT}/${encodeURIComponent(ref.sourceCommit)}/docs/${encodedPath}`,
      ].filter((value): value is string => Boolean(value));
      let lastError: unknown;
      for (const url of candidates) {
        try {
          const response = await fetch(url, {
            signal: signal
              ? AbortSignal.any([signal, AbortSignal.timeout(10_000)])
              : AbortSignal.timeout(10_000),
            cache: "force-cache",
          });
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
      const failure =
        lastError instanceof Error
          ? lastError
          : new Error("chord request failed");
      recordDiagnostic("error", "chord.fetch", failure);
      throw failure;
    },
  };
  return new ChordRepository(upstream, new BrowserChordCache(platform));
}

let sharedRepository: ChordRepository | undefined;
let startupSync: Promise<void> | undefined;
export function createBrowserChordRepository(): ChordRepository {
  return (sharedRepository ??= newBrowserChordRepository());
}
export function syncChordsOnStartup(): Promise<void> {
  return (startupSync ??= createBrowserChordRepository()
    .syncAll()
    .then((result) => {
      if (result.failed)
        recordDiagnostic(
          "info",
          "chord.sync",
          new Error(
            `${result.failed}/${result.checked} chord updates deferred`,
          ),
        );
    })
    .catch((error) => {
      if (error instanceof Error && error.name === "AbortError") return;
      recordDiagnostic("info", "chord.sync", error);
    }));
}

export async function stopChordSynchronization(): Promise<void> {
  const sync = startupSync;
  // A delayed shell import must not restart startup downloads after a reset.
  startupSync = Promise.resolve();
  await sharedRepository?.dispose();
  await sync;
  sharedRepository = undefined;
}
