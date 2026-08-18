import { describe, expect, it } from "vitest";
import type { DistributedAssetCatalog } from "@gys/contracts";
import { DistributedAssetManager } from "./distributed-asset-manager.js";
import { DistributedAssetStore } from "./distributed-asset-store.js";

function cacheStorage() {
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

function storage(): Storage {
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

const packageBytes = new Uint8Array([1, 2, 3, 4]);
const catalog: DistributedAssetCatalog = {
  version: 1,
  generatedAt: "2026-05-21T06:43:39.809Z",
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
      downloadUrl:
        "https://github.com/ThenGB/GYSApp-Data/releases/download/bibles-2026.05.21/b_kjv.gyspkg",
      installFileName: "b_kjv.db",
      sizeBytes: packageBytes.byteLength,
      checksumSha256:
        "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
    },
    {
      kind: "bible",
      code: "b_tb",
      title: "Terjemahan Baru",
      track: "bibles",
      bundledByDefault: true,
      version: "2026.05.21",
      releaseTag: "bibles-2026.05.21",
      fileName: "b_tb.gyspkg",
      downloadUrl:
        "https://github.com/ThenGB/GYSApp-Data/releases/download/bibles-2026.05.21/b_tb.gyspkg",
      installFileName: "b_tb.db",
      sizeBytes: packageBytes.byteLength,
      checksumSha256:
        "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
    },
  ],
};

describe("DistributedAssetManager", () => {
  it("reports bundled and optional assets and installs an optional package", async () => {
    const store = new DistributedAssetStore({
      cacheStorage: cacheStorage(),
      registry: storage(),
    });
    const manager = new DistributedAssetManager({
      catalogLoader: async () => catalog,
      store,
      fetcher: async () => new Response(packageBytes, { status: 200 }),
    });

    const before = await manager.loadStatuses();
    expect(before.find((item) => item.code === "b_tb")?.state).toBe("bundled");
    expect(before.find((item) => item.code === "b_kjv")?.state).toBe(
      "available",
    );

    await manager.install("b_kjv");
    const after = await manager.loadStatuses();
    expect(after.find((item) => item.code === "b_kjv")).toMatchObject({
      state: "installed",
      installedVersion: "2026.05.21",
    });
  });

  it("preserves the previous install when an update fails checksum validation", async () => {
    const store = new DistributedAssetStore({
      cacheStorage: cacheStorage(),
      registry: storage(),
    });
    let current = catalog;
    const manager = new DistributedAssetManager({
      catalogLoader: async () => current,
      store,
      fetcher: async () => new Response(packageBytes, { status: 200 }),
    });
    await manager.install("b_kjv");
    current = {
      ...catalog,
      items: catalog.items.map((item) =>
        item.code === "b_kjv"
          ? { ...item, version: "2026.06.01", checksumSha256: "f".repeat(64) }
          : item,
      ),
    };
    await manager.refresh();

    await expect(manager.install("b_kjv")).rejects.toThrow(
      "Distributed package checksum mismatch",
    );
    expect((await store.getRecord("b_kjv"))?.version).toBe("2026.05.21");
  });
});
