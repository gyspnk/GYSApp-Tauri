import { describe, expect, it } from "vitest";
import { parseSauhPosts, stripHtml } from "./sauh.js";

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
});
