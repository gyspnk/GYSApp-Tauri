import { describe, expect, it } from "vitest";
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
