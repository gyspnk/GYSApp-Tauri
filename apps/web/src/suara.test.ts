import { describe, expect, it, vi } from "vitest";
import { fetchSuara, parseSuaraSejati } from "./suara.js";

describe("Suara Sejati feed normalization", () => {
  it("filters untrusted URLs in a validated feed envelope", () => {
    const posts = parseSuaraSejati({
      source: "tjc.org",
      generatedAt: "2026-08-15T00:00:00.000Z",
      items: [
        {
          id: "foreign-envelope",
          title: "Sumber asing",
          excerpt: "Kesaksian.",
          url: "https://evil.example/foreign",
          imageUrl: "https://evil.example/image.jpg",
          publishedAt: "2026-08-15T00:00:00.000Z",
          source: "tjc.org",
        },
        {
          id: "safe-envelope",
          title: "Sumber aman",
          excerpt: "Kesaksian.",
          url: "https://tjc.org/id/suarasejati/safe",
          imageUrl: "https://evil.example/image.jpg",
          publishedAt: "2026-08-15T00:00:00.000Z",
          source: "tjc.org",
        },
      ],
    });

    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("safe-envelope");
    expect(posts[0]?.imageUrl).toBeUndefined();
  });

  it("drops invalid dates and foreign URLs while keeping safe TJC content", () => {
    const posts = parseSuaraSejati([
      {
        id: 1,
        slug: "foreign",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://evil.example/foreign",
        title: { rendered: "Sumber asing" },
        excerpt: { rendered: "<p>Kesaksian.</p>" },
      },
      {
        id: 2,
        slug: "invalid-date",
        date: "not-a-date",
        link: "https://tjc.org/id/suarasejati/invalid-date",
        title: { rendered: "Tanggal rusak" },
        excerpt: { rendered: "<p>Kesaksian.</p>" },
      },
      {
        id: 3,
        slug: "safe",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/suarasejati/safe",
        title: { rendered: "Sumber aman" },
        excerpt: { rendered: "<p>Kesaksian.</p>" },
        _embedded: {
          "wp:featuredmedia": [
            { source_url: "https://evil.example/image.jpg" },
          ],
        },
      },
    ]);

    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("safe");
    expect(posts[0]?.imageUrl).toBeUndefined();
  });

  it("loads every WordPress page when the direct source is used", async () => {
    const originalFetch = globalThis.fetch;
    const requestedPages: number[] = [];
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      location: { href: "https://app.example/" },
    });
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page") ?? "1");
      requestedPages.push(page);
      const posts =
        page === 1
          ? [
              {
                id: 1,
                slug: "kesaksian-satu",
                date: "2026-08-15T00:00:00.000Z",
                link: "https://tjc.org/id/suarasejati/kesaksian-satu/",
                title: { rendered: "Kesaksian satu" },
                excerpt: { rendered: "<p>Halaman pertama.</p>" },
              },
            ]
          : [
              {
                id: 2,
                slug: "kesaksian-dua",
                date: "2026-08-14T00:00:00.000Z",
                link: "https://tjc.org/id/suarasejati/kesaksian-dua/",
                title: { rendered: "Kesaksian dua" },
                excerpt: { rendered: "<p>Halaman kedua.</p>" },
              },
            ];
      return Response.json(posts, {
        headers: { "X-WP-TotalPages": "2" },
      });
    }) as typeof fetch;

    try {
      const posts = await fetchSuara();

      expect(posts.map((post) => post.id)).toEqual([
        "kesaksian-satu",
        "kesaksian-dua",
      ]);
      expect(requestedPages).toEqual([1, 2]);
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
    }
  });

  it("continues past full pages when pagination headers are unavailable", async () => {
    vi.resetModules();
    const { fetchSuara: fetchFreshSuara } = await import("./suara.js");
    const originalFetch = globalThis.fetch;
    const requestedPages: number[] = [];
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      location: { href: "https://app.example/" },
    });
    globalThis.fetch = (async (input) => {
      const url = new URL(String(input));
      const page = Number(url.searchParams.get("page") ?? "1");
      requestedPages.push(page);
      const start = (page - 1) * 100 + 1;
      const count = page < 3 ? 100 : 1;
      const posts = Array.from({ length: count }, (_, index) => {
        const id = start + index;
        return {
          id,
          slug: `kesaksian-${id}`,
          date: new Date(Date.UTC(2026, 7, 15) - id * 1_000).toISOString(),
          link: `https://tjc.org/id/suarasejati/kesaksian-${id}/`,
          title: { rendered: `Kesaksian ${id}` },
          excerpt: { rendered: `<p>Kesaksian ${id}.</p>` },
        };
      });
      return Response.json(posts);
    }) as typeof fetch;

    try {
      const posts = await fetchFreshSuara();

      expect(posts).toHaveLength(201);
      expect(posts.some((post) => post.id === "kesaksian-201")).toBe(true);
      expect(requestedPages).toEqual([1, 2, 3]);
    } finally {
      globalThis.fetch = originalFetch;
      vi.unstubAllGlobals();
    }
  });
});
