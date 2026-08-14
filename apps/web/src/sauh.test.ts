import { describe, expect, it } from "vitest";
import { onlyTodaySauh, parseSauhPosts, stripHtml } from "./sauh.js";

describe("Sauh feed normalization", () => {
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
});
