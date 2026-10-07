import { describe, expect, it, vi } from "vitest";
import type {
  ChordDocumentV2,
  ChordManifestV1,
  ChordRef,
} from "@gys/contracts";
import {
  ChordRepository,
  MemoryChordCache,
  type ChordUpstream,
} from "./chord-sync.js";

const ref: ChordRef = {
  songId: "hymn-001",
  path: "assets/chords/001.json",
  sourceCommit: "a3d1ea7",
  size: 83,
  sha256: "a".repeat(64),
};
const manifest: ChordManifestV1 = {
  version: 1,
  sourceRepo: "gyspnk/gyschordweb",
  sourceCommit: "a3d1ea7",
  generatedAt: "2026-08-14T00:00:00.000Z",
  entries: [ref],
};
const document: ChordDocumentV2 = {
  version: 2,
  songId: "hymn-001",
  title: "Kasih Setia-Mu",
  key: "C",
  sourceCommit: "a3d1ea7",
  sourcePath: ref.path,
  verses: [],
};

function bytesFor(documentValue: ChordDocumentV2): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(documentValue));
}

describe("ChordRepository", () => {
  it("backs off failed automatic legacy refreshes while allowing an explicit retry", async () => {
    const cache = Object.assign(new MemoryChordCache(), {
      isCurrent: async () => false,
      isIntegrityVerified: () => false,
    });
    const content = bytesFor(document);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      content as BufferSource,
    );
    const contentRef = {
      ...ref,
      size: content.byteLength,
      sha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    };
    await cache.putAtomic(contentRef, document, content);
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const repository = new ChordRepository(
      {
        getManifest: async () => ({
          manifest: { ...manifest, entries: [contentRef] },
        }),
        fetchChord: fetch,
      },
      cache,
      () => 0,
    );
    await expect(repository.syncAll()).resolves.toEqual({
      checked: 1,
      failed: 1,
    });
    await expect(repository.getChord(ref.songId)).resolves.toEqual(document);
    await expect(repository.syncAll()).resolves.toEqual({
      checked: 1,
      failed: 1,
    });
    expect(fetch).toHaveBeenCalledOnce();
    fetch.mockResolvedValue({ bytes: content, document });
    await expect(repository.revalidateSong(ref.songId)).resolves.toEqual(
      document,
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    await repository.dispose();
  });

  it("retries automatic refresh after the cooldown or an immutable source change", async () => {
    const cache = Object.assign(new MemoryChordCache(), {
      isCurrent: async () => false,
      isIntegrityVerified: () => false,
    });
    await cache.putAtomic(ref, document, bytesFor(document));
    let now = 0;
    let current = manifest;
    const fetch = vi.fn().mockRejectedValue(new Error("offline"));
    const repository = new ChordRepository(
      {
        getManifest: async () => ({ manifest: current }),
        fetchChord: fetch,
      },
      cache,
      () => now,
    );
    await repository.syncAll();
    await repository.syncAll();
    expect(fetch).toHaveBeenCalledOnce();
    now = 60_001;
    await repository.syncAll();
    expect(fetch).toHaveBeenCalledTimes(2);
    current = {
      ...manifest,
      sourceCommit: "deadbee",
      entries: [{ ...ref, sourceCommit: "deadbee" }],
    };
    await repository.syncAll();
    expect(fetch).toHaveBeenCalledTimes(3);
    await repository.dispose();
  });

  it("drains every startup worker on disposal without committing late downloads", async () => {
    const cache = Object.assign(new MemoryChordCache(), {
      dispose: vi.fn(async () => undefined),
    });
    const put = vi.spyOn(cache, "putAtomic");
    const downloads: Array<{
      signal: AbortSignal | undefined;
      finish: () => void;
    }> = [];
    const repository = new ChordRepository(
      {
        getManifest: async () => ({
          manifest: {
            ...manifest,
            entries: [1, 2, 3].map((number) => ({
              ...ref,
              songId: `hymn-00${number}`,
            })),
          },
        }),
        fetchChord: (_ref, signal) =>
          new Promise((resolve) => {
            downloads.push({
              signal,
              finish: () => resolve({ bytes: bytesFor(document), document }),
            });
          }),
      },
      cache,
    );
    const sync = repository.syncAll().catch((error: unknown) => error);
    await vi.waitFor(() => expect(downloads).toHaveLength(3));
    let finished = false;
    const disposal = repository.dispose().then(() => {
      finished = true;
    });
    expect(downloads.every((download) => download.signal?.aborted)).toBe(true);
    downloads[0]!.finish();
    downloads[1]!.finish();
    await Promise.resolve();
    expect(finished).toBe(false);
    expect(cache.dispose).not.toHaveBeenCalled();
    downloads[2]!.finish();
    await disposal;
    expect(await sync).toMatchObject({ name: "AbortError" });
    expect(put).not.toHaveBeenCalled();
    expect(cache.dispose).toHaveBeenCalledOnce();
    await expect(repository.getChord(ref.songId)).rejects.toMatchObject({
      name: "AbortError",
    });
  });

  it("startup sync skips unchanged note-aligned bytes across commits and downloads only changed files", async () => {
    const noteDoc = {
      version: 2 as const,
      type: "note-aligned" as const,
      pages: { "1": [{ noteIdx: 0, chord: "C" }] },
    };
    let currentDocument = noteDoc;
    let bytes = new TextEncoder().encode(JSON.stringify(noteDoc));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const hash = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const old = { ...ref, size: bytes.length, sha256: hash };
    const cache = new MemoryChordCache();
    await cache.putAtomic(old, noteDoc, bytes);
    let fetches = 0;
    let checks = 0;
    const latest = { ...old, sourceCommit: "deadbee" };
    const repository = new ChordRepository(
      {
        getManifest: async () => {
          checks++;
          return {
            manifest: {
              ...manifest,
              sourceCommit: latest.sourceCommit,
              entries: [latest],
            },
          };
        },
        fetchChord: async () => {
          fetches++;
          return { bytes, document: currentDocument };
        },
      },
      cache,
    );
    await expect(repository.syncAll()).resolves.toEqual({
      checked: 1,
      failed: 0,
    });
    await repository.syncAll();
    expect(checks).toBe(2);
    expect(fetches).toBe(0);
    await cache.remove(ref.songId);
    await repository.syncAll();
    expect(fetches).toBe(1);
    await repository.syncAll();
    expect(fetches).toBe(1);
    currentDocument = {
      ...noteDoc,
      pages: { "1": [{ noteIdx: 0, chord: "G" }] },
    };
    bytes = new TextEncoder().encode(JSON.stringify(currentDocument));
    latest.sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    latest.size = bytes.length;
    await repository.syncAll();
    expect(fetches).toBe(2);
    expect(await cache.get(ref.songId)).toEqual(currentDocument);
    await repository.syncAll();
    expect(fetches).toBe(2);
  });

  it("deduplicates simultaneous manifest requests", async () => {
    let calls = 0;
    const upstream: ChordUpstream = {
      getManifest: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { manifest };
      },
      fetchChord: async () => ({ bytes: bytesFor(document), document }),
    };
    const repository = new ChordRepository(
      upstream,
      new MemoryChordCache(),
      () => 0,
    );
    await Promise.all([
      repository.refreshManifest(),
      repository.refreshManifest(),
      repository.refreshManifest(),
    ]);
    expect(calls).toBe(1);
  });

  it("deduplicates simultaneous content requests for one song", async () => {
    const contentBytes = bytesFor(document);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      contentBytes as BufferSource,
    );
    const contentRef: ChordRef = {
      ...ref,
      size: contentBytes.byteLength,
      sha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    };
    const contentManifest = { ...manifest, entries: [contentRef] };
    let calls = 0;
    const upstream: ChordUpstream = {
      getManifest: async () => ({ manifest: contentManifest }),
      fetchChord: async () => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 1));
        return { bytes: contentBytes, document };
      },
    };
    const repository = new ChordRepository(
      upstream,
      new MemoryChordCache(),
      () => 0,
    );

    const results = await Promise.all([
      repository.getChord("hymn-001"),
      repository.getChord("hymn-001"),
      repository.getChord("hymn-001"),
    ]);

    expect(calls).toBe(1);
    expect(results).toHaveLength(3);
    expect(results[0]).toEqual(document);
  });

  it("keeps the manifest body on an ETag-only 304 response", async () => {
    let calls = 0;
    const upstream: ChordUpstream = {
      getManifest: async (etag) => {
        calls += 1;
        return etag
          ? { notModified: true, etag }
          : { manifest, etag: 'W/"a3d1ea7"' };
      },
      fetchChord: async () => ({ bytes: bytesFor(document), document }),
    };
    let now = 0;
    const repository = new ChordRepository(
      upstream,
      new MemoryChordCache(),
      () => now,
    );
    await repository.refreshManifest();
    now = 7 * 60 * 60 * 1000;
    await repository.refreshManifest();
    expect(calls).toBe(2);
  });

  it("keeps old cached content when the changed document fails integrity validation", async () => {
    const cache = new MemoryChordCache();
    const oldBytes = bytesFor(document);
    const oldRef = {
      ...ref,
      size: oldBytes.byteLength,
      sha256: "b".repeat(64),
    };
    await cache.putAtomic(oldRef, document, oldBytes);
    const changedRef = {
      ...ref,
      sourceCommit: "deadbee",
      size: oldBytes.byteLength,
      sha256: "c".repeat(64),
    };
    const upstream: ChordUpstream = {
      getManifest: async () => ({
        manifest: {
          ...manifest,
          sourceCommit: "deadbee",
          entries: [changedRef],
        },
      }),
      fetchChord: async () => ({
        bytes: oldBytes,
        document: { ...document, sourceCommit: "deadbee" },
      }),
    };
    const repository = new ChordRepository(upstream, cache, () => 86_400_000);
    await expect(repository.revalidateSong("hymn-001")).rejects.toThrow(
      "integrity",
    );
    expect(await cache.get("hymn-001")).toEqual(document);
  });

  it("negative-caches a missing song per immutable source commit", async () => {
    let manifestCalls = 0;
    const upstream: ChordUpstream = {
      getManifest: async () => {
        manifestCalls += 1;
        return { manifest: { ...manifest, entries: [] } };
      },
      fetchChord: async () => ({ bytes: new Uint8Array(), document }),
    };
    const repository = new ChordRepository(
      upstream,
      new MemoryChordCache(),
      () => 0,
    );
    await expect(repository.revalidateSong("hymn-404")).rejects.toThrow(
      "not available",
    );
    await expect(repository.revalidateSong("hymn-404")).rejects.toThrow(
      "not available",
    );
    expect(manifestCalls).toBe(1);
  });

  it("expires a missing-song cache after the rollback retention window", async () => {
    const contentBytes = bytesFor(document);
    const digest = await crypto.subtle.digest(
      "SHA-256",
      contentBytes as BufferSource,
    );
    const availableRef: ChordRef = {
      ...ref,
      songId: "hymn-404",
      size: contentBytes.byteLength,
      sha256: [...new Uint8Array(digest)]
        .map((value) => value.toString(16).padStart(2, "0"))
        .join(""),
    };
    const availableDocument = { ...document, songId: "hymn-404" };
    let now = 0;
    let manifestCalls = 0;
    const upstream: ChordUpstream = {
      getManifest: async () => {
        manifestCalls += 1;
        return manifestCalls === 1
          ? { manifest: { ...manifest, entries: [] } }
          : { manifest: { ...manifest, entries: [availableRef] } };
      },
      fetchChord: async () => ({
        bytes: contentBytes,
        document: availableDocument,
      }),
    };
    const repository = new ChordRepository(
      upstream,
      new MemoryChordCache(),
      () => now,
    );

    await expect(repository.revalidateSong("hymn-404")).rejects.toThrow(
      "not available",
    );
    now = 14 * 24 * 60 * 60 * 1000 + 1;
    await expect(repository.revalidateSong("hymn-404")).resolves.toEqual(
      availableDocument,
    );
    expect(manifestCalls).toBe(2);
  });
});
