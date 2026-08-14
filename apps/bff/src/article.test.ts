import { describe, expect, it } from "vitest";
import { htmlToText, normalizeArticle } from "./article.js";

describe("internal article normalizer", () => {
  it("keeps block structure, decodes entities, and drops executable content", () => {
    const text = htmlToText(
      '<article><h1>Kasih &amp; iman</h1><p>Baris pertama<br>baris kedua.</p><script>alert("x")</script><p>&#x2019;Aman&#8217;</p></article>',
    );
    expect(text).toBe("Kasih & iman\nBaris pertama\nbaris kedua.\n’Aman’");
    expect(text).not.toContain("alert");
    expect(text).not.toContain("<p>");
    expect(htmlToText("Akhir &amp;")).toBe("Akhir &");
  });

  it("prefers the article container and returns a validated document", () => {
    const document = normalizeArticle(
      "<nav>Menu</nav><article><h1>Judul resmi</h1><p>Isi yang dibaca.</p></article><footer>Footer</footer>",
      "https://tjc.org/id/kesaksian/judul/",
    );
    expect(document).toMatchObject({
      id: "id/kesaksian/judul",
      title: "Judul resmi",
      body: "Judul resmi\nIsi yang dibaca.",
      source: "tjc.org",
    });
  });
});
