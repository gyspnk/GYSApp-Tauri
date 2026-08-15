import { describe, expect, it } from "vitest";
import { normalizeSauhPosts, onlyTodaySauh } from "./sauh.js";

describe("BFF Sauh normalization", () => {
  it("drops items without a valid upstream date instead of making them current", () => {
    const posts = normalizeSauhPosts([
      {
        id: 1,
        slug: "missing-date",
        link: "https://tjc.org/id/sauh/missing-date/",
        title: { rendered: "Tanpa tanggal" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
      {
        id: 2,
        slug: "invalid-date",
        date: "not-a-date",
        link: "https://tjc.org/id/sauh/invalid-date/",
        title: { rendered: "Tanggal rusak" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
    ]);

    expect(posts).toEqual([]);
  });

  it("rejects foreign content links and strips foreign image URLs", () => {
    const posts = normalizeSauhPosts([
      {
        id: 3,
        slug: "foreign-source",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://evil.example/sauh/foreign-source",
        title: { rendered: "Sumber asing" },
        content: { rendered: "<p>Isi renungan.</p>" },
        _embedded: {
          "wp:featuredmedia": [
            { source_url: "https://evil.example/image.jpg" },
          ],
        },
      },
      {
        id: 4,
        slug: "safe-source",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/sauh/safe-source",
        title: { rendered: "Sumber aman" },
        content: { rendered: "<p>Isi renungan.</p>" },
        _embedded: {
          "wp:featuredmedia": [
            { source_url: "https://evil.example/image.jpg" },
          ],
        },
      },
    ]);

    expect(posts).toHaveLength(1);
    expect(posts[0]?.id).toBe("safe-source");
    expect(posts[0]?.imageUrl).toBeUndefined();
  });

  it("prefers the publisher's daily slug over an unrelated post edited today", () => {
    const posts = normalizeSauhPosts([
      {
        id: 1,
        slug: "sbj260814",
        date: "2026-08-13T17:00:00.000Z",
        modified: "2026-08-13T17:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260814/",
        title: { rendered: "Sauh hari ini" },
        content: { rendered: "<p>Ayat hari ini.</p>" },
      },
      {
        id: 2,
        slug: "artikel-lama-diedit",
        date: "2026-08-01T00:00:00.000Z",
        modified: "2026-08-14T00:30:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/artikel-lama-diedit/",
        title: { rendered: "Artikel lama" },
        content: { rendered: "<p>Isi lama yang baru diedit.</p>" },
      },
    ]);

    const selected = onlyTodaySauh(
      posts,
      new Date("2026-08-14T01:00:00.000+08:00"),
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe("sbj260814");
  });
});
