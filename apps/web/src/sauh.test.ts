import { describe, expect, it } from "vitest";
import {
  onlyTodaySauh,
  parseSauhPosts,
  selectTodaySauh,
  sauhNetworkCandidates,
  stripHtml,
} from "./sauh.js";

describe("Sauh feed normalization", () => {
  it("drops an upstream item without readable body instead of inventing content", () => {
    const posts = parseSauhPosts([
      {
        id: 77,
        slug: "missing-body",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/sauh/missing-body",
        title: { rendered: "Judul tanpa isi" },
        content: { rendered: "<div></div>" },
        excerpt: { rendered: "" },
      },
    ]);

    expect(posts).toEqual([]);
  });

  it("drops an upstream item without a valid publication date", () => {
    const posts = parseSauhPosts([
      {
        id: 78,
        slug: "missing-date",
        link: "https://tjc.org/id/sauh/missing-date",
        title: { rendered: "Tanpa tanggal" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
      {
        id: 79,
        slug: "invalid-date",
        date: "not-a-date",
        link: "https://tjc.org/id/sauh/invalid-date",
        title: { rendered: "Tanggal rusak" },
        content: { rendered: "<p>Isi renungan.</p>" },
      },
    ]);

    expect(posts).toEqual([]);
  });

  it("does not trust non-TJC links or images from a feed response", () => {
    const posts = parseSauhPosts([
      {
        id: 80,
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
        id: 81,
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

  it("sanitizes a string-form title before it reaches the home reader", () => {
    const posts = parseSauhPosts([
      {
        id: 82,
        slug: "string-title",
        date: "2026-08-15T00:00:00.000Z",
        link: "https://tjc.org/id/sauh/string-title",
        title: "<b>Judul aman</b>",
        content: { rendered: "<p>Isi renungan.</p>" },
      },
    ]);

    expect(posts[0]?.title).toBe("Judul aman");
  });

  it("tries the canonical Sauh endpoint before the optional BFF proxy", () => {
    expect(sauhNetworkCandidates("https://worker.example")).toEqual([
      "https://tjc.org/id/wp-json/wp/v2/posts?categories=229&per_page=6&orderby=date&order=desc&_embed=wp:featuredmedia",
      "https://worker.example/api/v1/content/sauh",
    ]);
  });

  it("extracts the title, reference, verse and source from WordPress markup", () => {
    const posts = parseSauhPosts([
      {
        id: 1,
        slug: "sbj260814",
        date: "2026-08-14T00:00:00+00:00",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260814/",
        title: { rendered: "Jagalah Hatimu!" },
        content: {
          rendered:
            '<h4>Matius 15:10-20</h4><p>"Karena dari hati timbul segala pikiran jahat..."</p>',
        },
      },
    ]);
    expect(posts).toHaveLength(1);
    expect(posts[0]?.reference).toBe("Matius 15:10-20");
    expect(posts[0]?.verse).toContain("Karena dari hati");
    expect(posts[0]?.source).toBe("tjc.org");
  });

  it("strips markup without losing paragraph boundaries", () => {
    expect(stripHtml("<p>Satu</p><p>Dua &amp; tiga</p>")).toBe(
      "Satu\nDua & tiga",
    );
  });

  it("drops executable and embedded markup before rendering text", () => {
    expect(
      stripHtml("<p>Aman</p><script>alert(1)</script><svg>bad</svg>"),
    ).toBe("Aman");
  });

  it("keeps only the current day's reflection for the home surface", () => {
    const posts = parseSauhPosts([
      {
        id: 1,
        slug: "today",
        date: "2026-08-14T00:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/today/",
        title: { rendered: "Hari ini" },
        content: { rendered: "<p>Renungan hari ini.</p>" },
      },
      {
        id: 2,
        slug: "yesterday",
        date: "2026-08-13T00:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/yesterday/",
        title: { rendered: "Kemarin" },
        content: { rendered: "<p>Renungan kemarin.</p>" },
      },
    ]);
    expect(
      onlyTodaySauh(posts, new Date("2026-08-14T12:00:00.000Z")),
    ).toHaveLength(1);
    expect(
      onlyTodaySauh(posts, new Date("2026-08-14T12:00:00.000Z"))[0]?.id,
    ).toBe("today");
  });

  it("uses the publisher's daily slug when UTC modification rolls over", () => {
    const post = parseSauhPosts([
      {
        id: 1,
        slug: "sbj260814",
        date: "2026-08-13T17:00:00.000Z",
        link: "https://tjc.org/id/gerakan-baca-alkitab/sbj260814/",
        title: { rendered: "Hari ini" },
        content: { rendered: "<p>Renungan.</p>" },
      },
    ]);
    expect(
      selectTodaySauh(post, new Date("2026-08-14T01:00:00.000+08:00")),
    ).toHaveLength(1);
  });

  it("prefers the publisher's canonical daily slug over an unrelated post edited today", () => {
    const posts = parseSauhPosts([
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

    const selected = selectTodaySauh(
      posts,
      new Date("2026-08-14T01:00:00.000+08:00"),
    );
    expect(selected).toHaveLength(1);
    expect(selected[0]?.id).toBe("sbj260814");
  });
});
