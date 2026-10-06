import { describe, expect, it, vi } from "vitest";
import type {
  AtomicBlobStore,
  ChordDocumentV2,
  ChordRef,
  PlatformDatabase,
  PlatformServices,
} from "@gys/contracts";
import { BrowserChordCache } from "./chord-cache.js";
import { ChordRepository } from "@gys/domain";

function platform(): PlatformServices {
  const values = new Map<string, unknown>();
  const blobs = new Map<string, Uint8Array>();
  const keyValue: PlatformDatabase = {
    engine: "memory",
    async get<T>(key: string) {
      return values.get(key) as T | undefined;
    },
    async set<T>(key: string, value: T) {
      values.set(key, structuredClone(value));
    },
    async remove(key) {
      values.delete(key);
    },
  };
  const blobStore: AtomicBlobStore = {
    async get(key) {
      return blobs.get(key)?.slice();
    },
    async putAtomic(key, bytes) {
      blobs.set(key, bytes.slice());
    },
    async remove(key) {
      blobs.delete(key);
    },
  };
  return {
    hasCapability: () => false,
    keyValue,
    database: keyValue,
    blobs: blobStore,
    secrets: {
      persistent: false,
      async get() {
        return undefined;
      },
      async set() {
        return undefined;
      },
      async remove() {
        return undefined;
      },
    },
    notifications: {
      async permission() {
        return "unsupported" as const;
      },
      async show() {
        throw new Error("notifications unavailable");
      },
    },
    files: {
      async open() {
        throw new Error("file dialogs unavailable");
      },
      async save() {
        throw new Error("file dialogs unavailable");
      },
    },
    share: {
      async share() {
        throw new Error("sharing unavailable");
      },
    },
    speech: [],
    deepLinks: { current: () => undefined, subscribe: () => () => undefined },
    lifecycle: { subscribe: () => () => undefined },
    openExternal: async () => undefined,
    now: () => 0,
  };
}

const document: ChordDocumentV2 = {
  version: 2,
  songId: "hymn-001",
  title: "Pujilah Allah Yang Maha Esa",
  key: "C",
  sourceCommit: "a3d1ea7",
  sourcePath: "assets/chord/001.json",
  verses: [],
};
const ref: ChordRef = {
  songId: "hymn-001",
  path: "assets/chord/001.json",
  sourceCommit: "a3d1ea7",
  size: 155,
  sha256: "674dd7e58804db7a91c88b3b6c050d4271fa678c191299fa054180b6e4cefe43",
};
const bytes = new TextEncoder().encode(JSON.stringify(document));

async function sha256(value: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    value as BufferSource,
  );
  return [...new Uint8Array(digest)]
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

describe("BrowserChordCache", () => {
  it("cancels advisory writes when its repository is disposed for reset", async () => {
    vi.useFakeTimers();
    try {
      const services = platform();
      const cache = new BrowserChordCache(services);
      await cache.putAtomic(ref, document, bytes);
      await cache.get(ref.songId);
      const write = vi.spyOn(services.keyValue, "set");
      await cache.dispose();
      await vi.advanceTimersByTimeAsync(1200);
      expect(write).not.toHaveBeenCalled();
      await expect(cache.get(ref.songId)).rejects.toThrow("disposed");
      await expect(cache.putAtomic(ref, document, bytes)).rejects.toThrow(
        "disposed",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("deduplicates verified reads and keeps warm readers off storage", async () => {
    const services = platform();
    const cache = new BrowserChordCache(services);
    await cache.putAtomic(ref, document, bytes);
    const read = vi.spyOn(services.blobs, "get");
    const write = vi.spyOn(services.keyValue, "set");
    await Promise.all(Array.from({ length: 8 }, () => cache.get(ref.songId)));
    for (let index = 0; index < 8; index++) await cache.get(ref.songId);
    expect(read).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
  });

  it("preserves the durable previous chord when committing the new pointer fails", async () => {
    const services = platform();
    const cache = new BrowserChordCache(services);
    await cache.putAtomic(ref, document, bytes);
    const changed = { ...document, title: "Revised hymn" };
    const nextBytes = new TextEncoder().encode(JSON.stringify(changed));
    const nextRef = {
      ...ref,
      size: nextBytes.length,
      sha256: await sha256(nextBytes),
    };
    vi.spyOn(services.keyValue, "set").mockRejectedValueOnce(
      new Error("disk full"),
    );
    await expect(cache.putAtomic(nextRef, changed, nextBytes)).rejects.toThrow(
      "disk full",
    );
    await expect(
      new BrowserChordCache(services).get(ref.songId),
    ).resolves.toEqual(document);
    await expect(cache.get(ref.songId)).resolves.toEqual(document);
    await expect(
      services.blobs.get(`chord/${ref.songId}/${nextRef.sha256}`),
    ).resolves.toBeUndefined();
  });

  it("startup reads one index and only downloads the changed chord in a 400-song cache", async () => {
    const services = platform();
    const noteDoc: ChordDocumentV2 = {
      version: 2,
      type: "note-aligned",
      pages: { "1": [{ noteIdx: 0, chord: "C" }] },
    };
    const content = new TextEncoder().encode(JSON.stringify(noteDoc));
    const hash = await sha256(content);
    const entries = Array.from({ length: 400 }, (_, index) => ({
      ...ref,
      songId: `hymn-${String(index + 1).padStart(3, "0")}`,
      size: content.length,
      sha256: hash,
    }));
    for (const entry of entries)
      await services.blobs.putAtomic(`chord/${entry.songId}/${hash}`, content);
    await services.keyValue.set(
      "gys-chord-cache-index-v1",
      Object.fromEntries(
        entries.map((entry) => [
          entry.songId,
          {
            format: 2,
            noteAligned: true,
            ref: entry,
            key: `chord/${entry.songId}/${hash}`,
            bytes: entry.size,
            lastAccess: 1,
            pinned: false,
          },
        ]),
      ),
    );
    const latest = entries.map((entry) => ({
      ...entry,
      sourceCommit: "deadbee",
    }));
    const changedDoc: ChordDocumentV2 = {
      ...noteDoc,
      pages: { "1": [{ noteIdx: 0, chord: "G" }] },
    };
    const changedBytes = new TextEncoder().encode(JSON.stringify(changedDoc));
    latest[399]!.sha256 = await sha256(changedBytes);
    const readIndex = vi.spyOn(services.keyValue, "get");
    const readBytes = vi.spyOn(services.blobs, "get");
    const writeIndex = vi.spyOn(services.keyValue, "set");
    const fetchChord = vi.fn(async () => ({
      bytes: changedBytes,
      document: changedDoc,
    }));
    const repository = new ChordRepository(
      {
        getManifest: async () => ({
          manifest: {
            version: 1,
            sourceRepo: "gyspnk/gyschordweb",
            sourceCommit: "deadbee",
            generatedAt: "2026-10-06T00:00:00.000Z",
            entries: latest,
          },
        }),
        fetchChord,
      },
      new BrowserChordCache(services),
    );
    await expect(repository.syncAll()).resolves.toEqual({
      checked: 400,
      failed: 0,
    });
    await repository.syncAll();
    expect(readIndex).toHaveBeenCalledOnce();
    expect(readBytes).toHaveBeenCalledOnce();
    expect(writeIndex).toHaveBeenCalledOnce();
    expect(fetchChord).toHaveBeenCalledOnce();
  });

  it("repairs a payload evicted separately from the startup index when opened", async () => {
    const services = platform();
    const cache = new BrowserChordCache(services);
    await cache.putAtomic(ref, document, bytes);
    await services.blobs.remove(`chord/${ref.songId}/${ref.sha256}`);
    const fetchChord = vi.fn(async () => ({ bytes, document }));
    const repository = new ChordRepository(
      {
        getManifest: async () => ({
          manifest: {
            version: 1,
            sourceRepo: "gyspnk/gyschordweb",
            sourceCommit: ref.sourceCommit,
            generatedAt: "2026-10-06T00:00:00.000Z",
            entries: [ref],
          },
        }),
        fetchChord,
      },
      cache,
    );
    await repository.syncAll();
    expect(fetchChord).not.toHaveBeenCalled();
    await expect(repository.getChord(ref.songId)).resolves.toEqual(document);
    expect(fetchChord).toHaveBeenCalledOnce();
  });
  it("persists an atomic pointer and preserves pinned entries", async () => {
    const services = platform();
    const cache = new BrowserChordCache(services);
    await cache.putAtomic(ref, document, bytes);
    expect(await cache.get(document.songId)).toEqual(document);
    await cache.pin(document.songId, true);
    const restored = new BrowserChordCache(services);
    expect(await restored.get(document.songId)).toEqual(document);
    expect(await restored.stats()).toMatchObject({ entries: 1, pinned: 1 });
    expect(restored.getRef(document.songId)?.sha256).toBe(ref.sha256);
  });

  it("shares the in-flight index load with concurrent reads", async () => {
    const services = platform();
    const key = `chord/${encodeURIComponent(document.songId)}/${ref.sha256}`;
    await services.blobs.putAtomic(
      key,
      new TextEncoder().encode(JSON.stringify(document)),
    );
    await services.keyValue.set("gys-chord-cache-index-v1", {
      [document.songId]: {
        ref,
        key,
        bytes: ref.size,
        pinned: false,
        lastAccess: 1,
      },
    });

    let releaseLoad!: () => void;
    const loading = new Promise<void>((resolve) => {
      releaseLoad = resolve;
    });
    let loadStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      loadStarted = resolve;
    });
    const originalGet = services.keyValue.get.bind(services.keyValue);
    services.keyValue.get = async <T>(indexKey: string) => {
      if (indexKey === "gys-chord-cache-index-v1") {
        loadStarted();
        await loading;
      }
      return originalGet<T>(indexKey);
    };

    const cache = new BrowserChordCache(services);
    const first = cache.get(document.songId);
    await started;
    const second = cache.get(document.songId);

    releaseLoad();
    await expect(first).resolves.toEqual(document);
    await expect(second).resolves.toEqual(document);
  });

  it("refetches a same-size corrupted cached chord before returning it", async () => {
    const services = platform();
    const cache = new BrowserChordCache(services);
    await cache.putAtomic(ref, document, bytes);
    const corruptedDocument = {
      ...document,
      title: "Pujilah Allah Yang Maha EsA",
    };
    const corruptedBytes = new TextEncoder().encode(
      JSON.stringify(corruptedDocument),
    );
    expect(corruptedBytes.byteLength).toBe(ref.size);
    await services.blobs.putAtomic(
      `chord/${encodeURIComponent(document.songId)}/${ref.sha256}`,
      corruptedBytes,
    );

    let fetches = 0;
    const repository = new ChordRepository(
      {
        getManifest: async () => ({
          manifest: {
            version: 1,
            sourceRepo: "gyspnk/gyschordweb",
            sourceCommit: ref.sourceCommit,
            generatedAt: "2026-08-14T00:00:00.000Z",
            entries: [ref],
          },
        }),
        fetchChord: async () => {
          fetches += 1;
          return { bytes, document };
        },
      },
      cache,
    );

    await expect(repository.getChord(document.songId)).resolves.toEqual(
      document,
    );
    expect(fetches).toBe(1);
    await expect(cache.get(document.songId)).resolves.toEqual(document);
  });

  it("keeps legacy offline entries and upgrades them on successful revalidation", async () => {
    const services = platform();
    const sourceBytes = new TextEncoder().encode(
      `${JSON.stringify(document, null, 2)}\n`,
    );
    const legacyRef: ChordRef = {
      ...ref,
      size: sourceBytes.byteLength,
      sha256: await sha256(sourceBytes),
    };
    const key = `chord/${encodeURIComponent(document.songId)}/${legacyRef.sha256}`;
    await services.blobs.putAtomic(
      key,
      new TextEncoder().encode(JSON.stringify(document)),
    );
    await services.keyValue.set("gys-chord-cache-index-v1", {
      [document.songId]: {
        ref: legacyRef,
        key,
        bytes: sourceBytes.byteLength,
        pinned: true,
        lastAccess: 1,
      },
    });

    const cache = new BrowserChordCache(services);
    await expect(cache.get(document.songId)).resolves.toEqual(document);
    expect(cache.isIntegrityVerified(document.songId)).toBe(false);

    let online = false;
    const repository = new ChordRepository(
      {
        getManifest: async () => ({
          manifest: {
            version: 1,
            sourceRepo: "gyspnk/gyschordweb",
            sourceCommit: legacyRef.sourceCommit,
            generatedAt: "2026-08-14T00:00:00.000Z",
            entries: [legacyRef],
          },
        }),
        fetchChord: async () => {
          if (!online) throw new Error("offline");
          return { bytes: sourceBytes, document };
        },
      },
      cache,
    );

    await expect(repository.getChord(document.songId)).resolves.toEqual(
      document,
    );
    await expect(repository.revalidateSong(document.songId)).rejects.toThrow(
      "offline",
    );
    await expect(cache.get(document.songId)).resolves.toEqual(document);

    online = true;
    await expect(repository.revalidateSong(document.songId)).resolves.toEqual(
      document,
    );
    expect(cache.isIntegrityVerified(document.songId)).toBe(true);
    await expect(services.blobs.get(key)).resolves.toEqual(sourceBytes);
    await expect(cache.stats()).resolves.toMatchObject({ pinned: 1 });
  });
});
