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

function localStorageMock(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => [...values.keys()][index] ?? null,
    get length() {
      return values.size;
    },
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

  it("removes stale index metadata when Cache Storage payload was evicted", async () => {
    const originalWindow = globalThis.window;
    const originalCaches = globalThis.caches;
    const originalLocalStorage = globalThis.localStorage;
    const caches = cacheStorage();
    const storage = localStorageMock({
      "gys-asset-index-v1": JSON.stringify({
        [item.id]: {
          id: item.id,
          version: item.version,
          cacheName: "gys-assets-v1-demo-midi-v1",
          url: item.url,
          bytes: 4,
          storedAt: "2026-09-12T00:00:00.000Z",
        },
      }),
    });
    vi.stubGlobal("window", { caches });
    vi.stubGlobal("caches", caches);
    vi.stubGlobal("localStorage", storage);

    try {
      const store = new BrowserAssetStore();
      expect(store.stats()).toEqual({ entries: 1, bytes: 4 });
      await expect(store.get(item)).resolves.toBeUndefined();
      expect(store.stats()).toEqual({ entries: 0, bytes: 0 });
    } finally {
      if (originalWindow === undefined)
        delete (globalThis as { window?: unknown }).window;
      else vi.stubGlobal("window", originalWindow);
      if (originalCaches === undefined)
        delete (globalThis as { caches?: unknown }).caches;
      else vi.stubGlobal("caches", originalCaches);
      if (originalLocalStorage === undefined)
        delete (globalThis as { localStorage?: unknown }).localStorage;
      else vi.stubGlobal("localStorage", originalLocalStorage);
    }
  });

  it("drops invalid cached PDFs and lets the next download retry", async () => {
    const originalWindow = globalThis.window;
    const originalCaches = globalThis.caches;
    const originalLocalStorage = globalThis.localStorage;
    const caches = cacheStorage();
    vi.stubGlobal("window", { caches });
    vi.stubGlobal("caches", caches);
    vi.stubGlobal("localStorage", localStorageMock());
    const pdfItem: AssetManifestItem = {
      id: "literature-pdf:demo",
      kind: "pdf",
      source: "remote",
      path: "https://assets.example/demo.pdf",
      url: "https://assets.example/demo.pdf",
      version: "v1",
      status: "remote",
      lastUpdated: "2026-09-28T00:00:00.000Z",
    };
    const invalid = new TextEncoder().encode("<html>offline error</html>");
    const valid = new TextEncoder().encode("%PDF-1.7\nfixture");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(invalid, {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(valid, {
          status: 200,
          headers: { "content-type": "application/pdf" },
        }),
      );
    const validatePdf = (bytes: Uint8Array) => {
      if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-")
        throw new Error("not a PDF");
    };

    try {
      const store = new BrowserAssetStore();
      await store.put(pdfItem, invalid, "text/html");
      await expect(
        store.download(pdfItem, undefined, validatePdf),
      ).rejects.toThrow("not a PDF");
      await expect(store.get(pdfItem)).resolves.toBeUndefined();

      await expect(
        store.download(pdfItem, undefined, validatePdf),
      ).resolves.toEqual(valid);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await expect(store.get(pdfItem)).resolves.toEqual(valid);
    } finally {
      fetchMock.mockRestore();
      if (originalWindow === undefined)
        delete (globalThis as { window?: unknown }).window;
      else vi.stubGlobal("window", originalWindow);
      if (originalCaches === undefined)
        delete (globalThis as { caches?: unknown }).caches;
      else vi.stubGlobal("caches", originalCaches);
      if (originalLocalStorage === undefined)
        delete (globalThis as { localStorage?: unknown }).localStorage;
      else vi.stubGlobal("localStorage", originalLocalStorage);
    }
  });
});
