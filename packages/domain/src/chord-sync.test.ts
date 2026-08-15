import { describe, expect, it } from "vitest";
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
  sourceCommit: "cbc7d386",
  size: 83,
  sha256: "a".repeat(64),
};
const manifest: ChordManifestV1 = {
  version: 1,
  sourceRepo: "gyspnk/gyschordweb",
  sourceCommit: "cbc7d386",
  generatedAt: "2026-08-14T00:00:00.000Z",
  entries: [ref],
};
const document: ChordDocumentV2 = {
  version: 2,
  songId: "hymn-001",
  title: "Kasih Setia-Mu",
  key: "C",
  sourceCommit: "cbc7d386",
  sourcePath: ref.path,
  verses: [],
};

function bytesFor(documentValue: ChordDocumentV2): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(documentValue));
}

describe("ChordRepository", () => {
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
          : { manifest, etag: 'W/"cbc7d386"' };
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
