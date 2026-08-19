import { afterEach, describe, expect, it, vi } from "vitest";
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
  afterEach(() => vi.unstubAllGlobals());

  it("uses the browser fetch receiver and BFF route when no fetcher is injected", async () => {
    const store = new DistributedAssetStore({
      cacheStorage: cacheStorage(),
      registry: storage(),
    });
    vi.stubGlobal("fetch", function (this: unknown, input: RequestInfo | URL) {
      if (this !== globalThis) throw new TypeError("Illegal invocation");
      expect(String(input)).toBe(
        "https://worker.example/api/v1/assets/distributed/b_kjv",
      );
      return Promise.resolve(new Response(packageBytes, { status: 200 }));
    });
    const manager = new DistributedAssetManager({
      catalogLoader: async () => catalog,
      store,
      downloadBaseUrl: "https://worker.example/",
    });

    await expect(manager.install("b_kjv")).resolves.toBeUndefined();
  });

  it("reports a configuration error instead of attempting a cross-origin download", async () => {
    const manager = new DistributedAssetManager({
      catalogLoader: async () => catalog,
      store: new DistributedAssetStore({
        cacheStorage: cacheStorage(),
        registry: storage(),
      }),
      downloadBaseUrl: "",
    });

    await expect(manager.install("b_kjv")).rejects.toThrow(
      "Distributed download service is not configured",
    );
  });

  it("does not register an asset after an HTTP failure", async () => {
    const store = new DistributedAssetStore({
      cacheStorage: cacheStorage(),
      registry: storage(),
    });
    const manager = new DistributedAssetManager({
      catalogLoader: async () => catalog,
      store,
      fetcher: async () => new Response(null, { status: 503 }),
    });

    await expect(manager.install("b_kjv")).rejects.toThrow(
      "Distributed asset request failed: 503",
    );
    await expect(store.getRecord("b_kjv")).resolves.toBeUndefined();
  });

  it("passes abort signals through without leaving a partial install", async () => {
    const store = new DistributedAssetStore({
      cacheStorage: cacheStorage(),
      registry: storage(),
    });
    const controller = new AbortController();
    controller.abort();
    const manager = new DistributedAssetManager({
      catalogLoader: async () => catalog,
      store,
      fetcher: async (_input, init) => {
        init?.signal?.throwIfAborted();
        return new Response(packageBytes, { status: 200 });
      },
    });

    await expect(
      manager.install("b_kjv", { signal: controller.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await expect(store.getRecord("b_kjv")).resolves.toBeUndefined();
  });

  it("rejects a response that exceeds the manifest size", async () => {
    const store = new DistributedAssetStore({
      cacheStorage: cacheStorage(),
      registry: storage(),
    });
    const manager = new DistributedAssetManager({
      catalogLoader: async () => catalog,
      store,
      fetcher: async () =>
        new Response(new Uint8Array([...packageBytes, 5]), { status: 200 }),
    });

    await expect(manager.install("b_kjv")).rejects.toThrow(
      "Distributed package exceeds its declared size",
    );
    await expect(store.getRecord("b_kjv")).resolves.toBeUndefined();
  });

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

  it("repairs a stale registry after Cache Storage eviction", async () => {
    const cache = cacheStorage();
    const store = new DistributedAssetStore({
      cacheStorage: cache,
      registry: storage(),
    });
    const manager = new DistributedAssetManager({
      catalogLoader: async () => catalog,
      store,
      fetcher: async () => new Response(packageBytes, { status: 200 }),
    });
    await manager.install("b_kjv");
    const record = await store.getRecord("b_kjv");
    await cache.delete(record!.cacheName);

    expect(
      (await manager.loadStatuses()).find((item) => item.code === "b_kjv")
        ?.state,
    ).toBe("available");
    await expect(store.getRecord("b_kjv")).resolves.toBeUndefined();
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

  it("verifies and stores hymnal metadata in the same install", async () => {
    const store = new DistributedAssetStore({
      cacheStorage: cacheStorage(),
      registry: storage(),
    });
    const metadataBytes = new TextEncoder().encode("[]");
    const hymnalCatalog: DistributedAssetCatalog = {
      ...catalog,
      items: [
        ...catalog.items,
        {
          kind: "hymnal",
          code: "HYMNE",
          title: "Hymne",
          track: "hymnals",
          bundledByDefault: false,
          version: "2026.05.21",
          releaseTag: "hymnals-2026.05.21",
          fileName: "hymne.gyspkg",
          downloadUrl:
            "https://github.com/ThenGB/GYSApp-Data/releases/download/hymnals-2026.05.21/hymne.gyspkg",
          installFileName: "hymne_master.pdf",
          sizeBytes: packageBytes.byteLength,
          checksumSha256:
            "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
          metadata: {
            sourceRepo: "ThenGB/GYSAPP-Fork",
            sourceCommit: "4f0d39b",
            path: "assets/data/index/hymne_index.json",
            downloadUrl:
              "https://raw.githubusercontent.com/ThenGB/GYSAPP-Fork/4f0d39b/assets/data/index/hymne_index.json",
            sizeBytes: metadataBytes.byteLength,
            checksumSha256:
              "4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945",
          },
        },
      ],
    };
    const manager = new DistributedAssetManager({
      catalogLoader: async () => hymnalCatalog,
      store,
      fetcher: async (input) =>
        new Response(
          String(input).includes("hymne_index.json")
            ? metadataBytes
            : packageBytes,
          { status: 200 },
        ),
    });

    await manager.install("HYMNE");

    expect(await store.getMetadataBytes("HYMNE")).toEqual(metadataBytes);
  });
});
