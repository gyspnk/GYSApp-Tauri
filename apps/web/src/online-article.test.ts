import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchOnlineArticle } from "./online-article.js";

describe("online article compatibility reader", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses the allowlisted WordPress feed when the Worker is absent", async () => {
    const fetchMock = vi.fn<typeof fetch>(async () =>
      Response.json([
        {
          id: 12,
          title: { rendered: "<b>Judul</b>" },
          content: {
            rendered:
              "<p>Isi pertama.</p><script>bad()</script><p>Isi kedua.</p>",
          },
          modified: "2026-08-14T00:00:00.000Z",
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const article = await fetchOnlineArticle(
      "https://tjc.org/id/suarasejati/judul/",
    );
    expect(article).toMatchObject({
      id: "12",
      title: "Judul",
      body: "Isi pertama.\nIsi kedua.",
      source: "tjc.org",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ headers: { accept: "application/json" } }),
    );
  });
});
