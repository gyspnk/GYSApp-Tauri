import { describe, expect, it, vi } from "vitest";
import { compareAssetManifests, parseAssetManifest } from "./asset-updater.js";
import { applyAssetManifestUpdate } from "./asset-updater.js";
import type { AssetManifestV1 } from "@gys/contracts";

const item = {
  id: "bible-tb",
  kind: "bible" as const,
  source: "local" as const,
  path: "offline/bible/b_tb.db",
  version: "sha-a",
  sha256: "a".repeat(64),
  bytes: 3,
  status: "available" as const,
  lastUpdated: "2026-08-15T00:00:00.000Z",
};

function manifest(items: AssetManifestV1["items"]): AssetManifestV1 {
  return {
    version: 1,
    generatedAt: "2026-08-15T00:00:00.000Z",
    items,
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

function cacheStorage() {
  const stores = new Map<string, Map<string, Response>>();
  return {
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, Response>();
      stores.set(name, store);
      return {
        match: async (url: string) => store.get(url)?.clone(),
        put: async (url: string, response: Response) => {
          store.set(url, response.clone());
        },
        delete: async (url: string) => store.delete(url),
      };
    },
    delete: async (name: string) => stores.delete(name),
  };
}

describe("asset manifest updates", () => {
  it("ignores generatedAt/lastUpdated churn when content identity is unchanged", () => {
    const next = {
      ...item,
      lastUpdated: "2026-08-16T00:00:00.000Z",
    };
    const diff = compareAssetManifests(manifest([item]), manifest([next]));
    expect(diff).toMatchObject({
      added: [],
      changed: [],
      removed: [],
      unchanged: 1,
      hasUpdate: false,
    });
  });

  it("classifies changed, added, and removed assets independently", () => {
    const changed = { ...item, version: "sha-b", sha256: "b".repeat(64) };
    const added = {
      ...item,
      id: "hymn-catalog",
      version: "sha-c",
      sha256: "c".repeat(64),
    };
    const removed = { ...item, id: "faith-topics" };
    const diff = compareAssetManifests(
      manifest([item, removed]),
      manifest([changed, added]),
    );
    expect(diff.changed.map(({ id }) => id)).toEqual(["bible-tb"]);
    expect(diff.added.map(({ id }) => id)).toEqual(["hymn-catalog"]);
    expect(diff.removed.map(({ id }) => id)).toEqual(["faith-topics"]);
    expect(diff.hasUpdate).toBe(true);
  });

  it("rejects duplicate IDs before an active pointer can be published", () => {
    expect(() => parseAssetManifest(manifest([item, item]))).toThrow(
      "Duplicate asset id: bible-tb",
    );
  });

  it("rejects remote assets outside the manifest origin or trusted sources", () => {
    const remote = {
      ...item,
      id: "cover",
      kind: "cover" as const,
      source: "remote" as const,
      path: "https://evil.example/cover.jpg",
      url: "https://evil.example/cover.jpg",
      status: "remote" as const,
    };
    expect(() =>
      parseAssetManifest(
        manifest([remote]),
        "https://assets.example.test/manifest.json",
      ),
    ).toThrow("Asset URL origin is not allowlisted");
  });

  it("keeps the previous active pointer when a changed asset fails validation", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const sha256 = [...new Uint8Array(digest)]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const base = {
      ...item,
      sha256,
      bytes: bytes.byteLength,
      path: "offline/test.bin",
    };
    const caches = cacheStorage();
    const localStorage = storage();
    vi.stubGlobal("window", {
      location: {
        href: "https://app.example/GYSApp-Tauri/",
        origin: "https://app.example",
      },
      caches,
    });
    vi.stubGlobal("caches", caches);
    vi.stubGlobal("localStorage", localStorage);
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementation(
      async () =>
        new Response(bytes.slice(), {
          status: 200,
          headers: { "content-type": "application/octet-stream" },
        }),
    );
    try {
      await applyAssetManifestUpdate(undefined, manifest([base]), {
        forceAll: true,
      });
      const pointer = localStorage.getItem("gys-active-asset-manifest-v1");
      expect(pointer).toContain('"sourceUrl"');

      const changed = { ...base, version: "v2", sha256: "f".repeat(64) };
      fetchMock.mockImplementation(
        async () => new Response(bytes.slice(), { status: 200 }),
      );
      await expect(
        applyAssetManifestUpdate(manifest([base]), manifest([changed])),
      ).rejects.toThrow("Asset checksum mismatch");
      expect(localStorage.getItem("gys-active-asset-manifest-v1")).toBe(
        pointer,
      );
    } finally {
      fetchMock.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});
