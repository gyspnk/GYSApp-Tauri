import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { SuaraSejatiPost } from "@gys/contracts";

const PERSIST_KEY = "gys_suara_feed_v1";

function post(partial: Partial<SuaraSejatiPost>): SuaraSejatiPost {
  return {
    id: "suara-test",
    title: "Kesaksian uji",
    excerpt: "Cuplikan pengujian.",
    url: "https://tjc.org/id/suarasejati/suara-test/",
    publishedAt: "2026-08-01T00:00:00.000Z",
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

describe("Suara Sejati persistent + incremental cache", () => {
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

  it("paints the persisted feed without any network and merges only additions", async () => {
    const saved = post({
      id: "suara-lama",
      title: "Kesaksian tersimpan",
      publishedAt: "2026-07-01T00:00:00.000Z",
    });
    storage.set(
      PERSIST_KEY,
      JSON.stringify({ fetchedAt: new Date().toISOString(), items: [saved] }),
    );
    const fresh = post({
      id: "suara-baru",
      title: "Kesaksian terbaru",
      publishedAt: "2026-08-20T00:00:00.000Z",
    });
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      fetchCalls.push(String(input));
      return Promise.resolve(
        new Response(JSON.stringify([fresh]), { status: 200 }),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSuara, subscribeSuara } = await import("./suara.js");
    const updates: SuaraSejatiPost[][] = [];
    const unsubscribe = subscribeSuara((items) => updates.push(items));

    // First load resolves instantly from persistence; zero requests so far.
    const first = await fetchSuara();
    expect(first.map((item) => item.id)).toEqual(["suara-lama"]);
    expect(fetchCalls).toEqual([]);

    // Background revalidation adds only upstream additions, keeping order.
    await until(() => {
      expect(updates.length).toBeGreaterThan(0);
      expect(updates[0]?.map((item) => item.id)).toEqual([
        "suara-baru",
        "suara-lama",
      ]);
    });
    unsubscribe();

    const persisted: unknown = JSON.parse(storage.get(PERSIST_KEY) ?? "{}");
    const items = (persisted as { items?: SuaraSejatiPost[] }).items ?? [];
    expect(items.map((item) => item.id)).toEqual(["suara-baru", "suara-lama"]);
  });

  it("dedupes a revalidation response instead of duplicating cached entries", async () => {
    const same = post({ id: "suara-sama" });
    storage.set(
      PERSIST_KEY,
      JSON.stringify({
        fetchedAt: new Date().toISOString(),
        items: [same],
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        fetchCalls.push(String(input));
        return Promise.resolve(new Response(JSON.stringify([same])));
      }),
    );

    const { fetchSuara, subscribeSuara } = await import("./suara.js");
    const updates: SuaraSejatiPost[][] = [];
    const unsubscribe = subscribeSuara((items) => updates.push(items));

    const items = await fetchSuara();
    expect(items).toHaveLength(1);

    // Let the background revalidation settle: no duplicates, no repaint.
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(updates).toHaveLength(0);
    unsubscribe();
  });

  it("falls back to the packaged snapshot when nothing is cached", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        fetchCalls.push(String(input));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              source: "tjc.org",
              generatedAt: "2026-08-01T00:00:00.000Z",
              items: [post({ id: "suara-snapshot" })],
            }),
            { status: 200 },
          ),
        );
      }),
    );

    const { fetchSuara, getCachedSuara } = await import("./suara.js");
    const items = await fetchSuara();
    expect(items.map((item) => item.id)).toEqual(["suara-snapshot"]);
    expect(getCachedSuara()?.map((item) => item.id)).toEqual([
      "suara-snapshot",
    ]);
    expect(storage.has(PERSIST_KEY)).toBe(true);
  });
});
