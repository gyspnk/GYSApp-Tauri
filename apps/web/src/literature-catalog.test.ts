import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { LiteratureItem } from "@gys/contracts";

const PERSIST_KEY = "gys_literature_catalog_v1";

function item(partial: Partial<LiteratureItem>): LiteratureItem {
  return {
    id: "literature-test",
    category: "kesaksian",
    title: "Bacaan uji",
    description: "",
    url: "https://tjc.org/id/kesaksian/literature-test/",
    format: "article",
    publishedAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    source: "tjc.org",
    ...partial,
  };
}

async function until(assertion: () => void): Promise<void> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    try {
      assertion();
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  assertion();
}

describe("Literature persistent + incremental catalog", () => {
  let storage: Map<string, string>;
  let fetchCalls: string[];

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    // Keep candidate resolution relative so no real BFF worker is contacted.
    vi.stubEnv("VITE_BFF_BASE_URL", "");
    storage = new Map();
    fetchCalls = [];
    const events = new EventTarget();
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("window", {
      setTimeout,
      clearTimeout,
      location: { href: "http://localhost:4173/GYSApp-Tauri/", port: "4173" },
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => void storage.set(key, value),
        removeItem: (key: string) => void storage.delete(key),
      },
      addEventListener: events.addEventListener.bind(events),
      removeEventListener: events.removeEventListener.bind(events),
      dispatchEvent: events.dispatchEvent.bind(events),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hydrates the persisted catalog without network and appends upstream additions", async () => {
    const saved = item({
      id: "warta-lama",
      title: "Warta tersimpan",
      publishedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
    });
    storage.set(
      PERSIST_KEY,
      JSON.stringify({ fetchedAt: new Date().toISOString(), items: [saved] }),
    );
    const fresh = item({
      id: "warta-baru",
      title: "Warta terbaru",
      publishedAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        fetchCalls.push(String(input));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "tjc.org",
              generatedAt: new Date().toISOString(),
              items: [fresh],
            }),
            { status: 200 },
          ),
        );
      }),
    );

    const { fetchLiteratureCatalog, subscribeLiterature } =
      await import("./literature-catalog.js");
    const updates: LiteratureItem[][] = [];
    const unsubscribe = subscribeLiterature((items) => updates.push(items));

    const first = await fetchLiteratureCatalog();
    expect(first.map((entry) => entry.id)).toEqual(["warta-lama"]);
    expect(fetchCalls).toEqual([]);

    await until(() => {
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0]?.map((entry) => entry.id)).toEqual([
        "warta-baru",
        "warta-lama",
      ]);
    });
    unsubscribe();

    const persisted: unknown = JSON.parse(storage.get(PERSIST_KEY) ?? "{}");
    const items = (persisted as { items?: LiteratureItem[] }).items ?? [];
    expect(items.map((entry) => entry.id)).toEqual([
      "warta-baru",
      "warta-lama",
    ]);
  });

  it("keeps persisted covers when upstream metadata lacks them", async () => {
    const covered = item({
      id: "buku-cover",
      title: "Buku bergambar",
      imageUrl: "https://tjc.org/id/wp-content/uploads/sites/43/cover.png",
    });
    storage.set(
      PERSIST_KEY,
      JSON.stringify({ fetchedAt: new Date().toISOString(), items: [covered] }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              source: "tjc.org",
              generatedAt: new Date().toISOString(),
              items: [item({ id: "buku-cover", title: "Buku bergambar" })],
            }),
            { status: 200 },
          ),
        ),
      ),
    );

    const { fetchLiteratureCatalog, getCachedLiteratureCatalog } =
      await import("./literature-catalog.js");
    const first = await fetchLiteratureCatalog();
    expect(first).toHaveLength(1);

    // Let the background revalidation settle, then verify the local cache
    // kept the richer entry instead of being overwritten by bare metadata.
    await new Promise((resolve) => setTimeout(resolve, 300));
    const cached = getCachedLiteratureCatalog();
    expect(cached).toHaveLength(1);
    expect(cached?.[0]?.imageUrl).toContain("cover.png");
  });
});
