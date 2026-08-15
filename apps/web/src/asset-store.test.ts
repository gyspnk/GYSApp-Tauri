import { describe, expect, it, vi } from "vitest";
import type { AssetManifestItem } from "@gys/contracts";
import { BrowserAssetStore } from "./asset-store.js";

const item: AssetManifestItem = {
  id: "demo-midi",
  kind: "midi",
  source: "remote",
  path: "assets/midi/demo.mid",
  url: "https://assets.example/demo.mid",
  version: "v1",
  bytes: 4,
  status: "remote",
  lastUpdated: "2026-08-15T00:00:00.000Z",
};

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

describe("BrowserAssetStore", () => {
  it("shares one in-flight download for simultaneous callers", async () => {
    const originalWindow = globalThis.window;
    const originalCaches = globalThis.caches;
    const caches = cacheStorage();
    vi.stubGlobal("window", { caches });
    vi.stubGlobal("caches", caches);
    let fetchCalls = 0;
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => {
        fetchCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { "content-type": "audio/midi" },
        });
      });
    try {
      const store = new BrowserAssetStore();
      const [first, second] = await Promise.all([
        store.download(item),
        store.download(item),
      ]);
      expect(fetchCalls).toBe(1);
      expect([...first]).toEqual([1, 2, 3, 4]);
      expect([...second]).toEqual([1, 2, 3, 4]);
    } finally {
      fetchMock.mockRestore();
      if (originalWindow === undefined)
        delete (globalThis as { window?: unknown }).window;
      else vi.stubGlobal("window", originalWindow);
      if (originalCaches === undefined)
        delete (globalThis as { caches?: unknown }).caches;
      else vi.stubGlobal("caches", originalCaches);
    }
  });
});
