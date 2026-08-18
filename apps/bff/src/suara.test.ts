import { describe, expect, it } from "vitest";
import { fetchSuaraSejati } from "./suara.js";

describe("Suara Sejati source fetching", () => {
  it("loads every WordPress page instead of only the first page", async () => {
    const originalFetch = globalThis.fetch;
    const requestedPages: number[] = [];
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
      const posts = await fetchSuaraSejati(
        "https://tjc.org/id/wp-json/wp/v2/posts?categories=194",
      );

      expect(posts.map((post) => post.id)).toEqual([
        "kesaksian-satu",
        "kesaksian-dua",
      ]);
      expect(requestedPages).toEqual([1, 2]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
