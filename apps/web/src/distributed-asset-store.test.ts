import { describe, expect, it } from "vitest";
import {
  DistributedAssetStore,
  type DistributedAssetRecordInput,
} from "./distributed-asset-store.js";

function memoryCacheStorage() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (key: string) => store.get(key)?.clone(),
        put: async (key: string, response: Response) => {
          store.set(key, response.clone());
        },
        delete: async (key: string) => store.delete(key),
      };
    },
    delete: async (name: string) => stores.delete(name),
  };
}

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
  };
}

const input: DistributedAssetRecordInput = {
  code: "b_kjv",
  kind: "bible",
  version: "2026.05.21",
  releaseTag: "bibles-2026.05.21",
  installFileName: "b_kjv.db",
  packageSizeBytes: 1_935_399,
  packageChecksumSha256: "a".repeat(64),
};

describe("DistributedAssetStore", () => {
  it("stores payload bytes and registry metadata across instances", async () => {
    const cacheStorage = memoryCacheStorage();
    const registry = memoryStorage();
    const first = new DistributedAssetStore({ cacheStorage, registry });
    await first.put(input, new Uint8Array([1, 2, 3]));

    const second = new DistributedAssetStore({ cacheStorage, registry });
    expect(await second.getBytes("b_kjv")).toEqual(new Uint8Array([1, 2, 3]));
    expect(await second.getRecord("b_kjv")).toMatchObject({
      code: "b_kjv",
      version: "2026.05.21",
      payloadBytes: 3,
    });
  });

  it("stores an optional verified catalog beside the payload", async () => {
    const cacheStorage = memoryCacheStorage();
    const registry = memoryStorage();
    const store = new DistributedAssetStore({ cacheStorage, registry });
    const catalog = new TextEncoder().encode('[{"number":1}]');

    await store.put(input, new Uint8Array([1, 2, 3]), {
      bytes: catalog,
      checksumSha256: "b".repeat(64),
    });

    expect(await store.getMetadataBytes("b_kjv")).toEqual(catalog);
    expect(await store.getRecord("b_kjv")).toMatchObject({
      metadataBytes: catalog.byteLength,
      metadataChecksumSha256: "b".repeat(64),
    });
  });

  it("removes only the selected asset", async () => {
    const cacheStorage = memoryCacheStorage();
    const registry = memoryStorage();
    const store = new DistributedAssetStore({ cacheStorage, registry });
    await store.put(input, new Uint8Array([1]));
    await store.put(
      { ...input, code: "b_cuv", installFileName: "b_cuv.db" },
      new Uint8Array([2]),
    );

    await store.remove("b_kjv");
    expect(await store.getBytes("b_kjv")).toBeUndefined();
    expect(await store.getBytes("b_cuv")).toEqual(new Uint8Array([2]));
  });

  it("does not report a registry entry whose cache was evicted", async () => {
    const cacheStorage = memoryCacheStorage();
    const registry = memoryStorage();
    const store = new DistributedAssetStore({ cacheStorage, registry });
    await store.put(input, new Uint8Array([1]));
    const record = await store.getRecord("b_kjv");
    await cacheStorage.delete(record!.cacheName);

    await expect(store.hasCachedPayload("b_kjv")).resolves.toBe(false);
  });

  it("keeps the cache when removing the registry pointer fails", async () => {
    const cacheStorage = memoryCacheStorage();
    const registry = memoryStorage();
    const store = new DistributedAssetStore({ cacheStorage, registry });
    await store.put(input, new Uint8Array([1]));
    registry.setItem = () => {
      throw new Error("quota");
    };

    await expect(store.remove("b_kjv")).rejects.toThrow("quota");
    await expect(store.getBytes("b_kjv")).resolves.toEqual(new Uint8Array([1]));
  });

  it("keeps the previous record when the new registry pointer cannot be saved", async () => {
    const cacheStorage = memoryCacheStorage();
    const registry = memoryStorage();
    const store = new DistributedAssetStore({ cacheStorage, registry });
    await store.put(input, new Uint8Array([1]));
    const originalSetItem = registry.setItem.bind(registry);
    registry.setItem = (key, value) => {
      if (value.includes("2026.06.01")) throw new Error("quota");
      originalSetItem(key, value);
    };

    await expect(
      store.put({ ...input, version: "2026.06.01" }, new Uint8Array([9])),
    ).rejects.toThrow("quota");
    expect(await store.getBytes("b_kjv")).toEqual(new Uint8Array([1]));
    expect((await store.getRecord("b_kjv"))?.version).toBe("2026.05.21");
  });
});
