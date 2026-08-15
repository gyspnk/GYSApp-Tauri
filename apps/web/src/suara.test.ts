import { describe, expect, it } from "vitest";
import { parseSuaraSejati } from "./suara.js";

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
});
