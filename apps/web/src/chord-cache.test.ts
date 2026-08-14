import { describe, expect, it } from "vitest";
import type {
  AtomicBlobStore,
  ChordDocumentV2,
  ChordRef,
  KeyValueStore,
  PlatformServices,
} from "@gys/contracts";
import { BrowserChordCache } from "./chord-cache.js";

function platform(): PlatformServices {
  const values = new Map<string, unknown>();
  const blobs = new Map<string, Uint8Array>();
  const keyValue: KeyValueStore = {
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
    blobs: blobStore,
    speech: [],
    openExternal: async () => undefined,
    now: () => 0,
  };
}

const document: ChordDocumentV2 = {
  version: 2,
  songId: "hymn-001",
  title: "Pujilah Allah Yang Maha Esa",
  key: "C",
  sourceCommit: "cbc7d386",
  sourcePath: "assets/chord/001.json",
  verses: [],
};
const ref: ChordRef = {
  songId: "hymn-001",
  path: "assets/chord/001.json",
  sourceCommit: "cbc7d386",
  size: 100,
  sha256: "a".repeat(64),
};

describe("BrowserChordCache", () => {
  it("persists an atomic pointer and preserves pinned entries", async () => {
    const services = platform();
    const cache = new BrowserChordCache(services);
    await cache.putAtomic(ref, document, new Uint8Array(ref.size));
    expect(await cache.get(document.songId)).toEqual(document);
    await cache.pin(document.songId, true);
    const restored = new BrowserChordCache(services);
    expect(await restored.get(document.songId)).toEqual(document);
    expect(await restored.stats()).toMatchObject({ entries: 1, pinned: 1 });
    expect(restored.getRef(document.songId)?.sha256).toBe(ref.sha256);
  });
});
