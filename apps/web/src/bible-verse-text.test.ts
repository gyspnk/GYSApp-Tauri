import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BibleVerseText, HighlightedText } from "./bible-verse-text.js";

const renderVerse = (raw: string, query = "") =>
  renderToStaticMarkup(createElement(BibleVerseText, { raw, query }));

describe("Bible verse rendering contract", () => {
  it("retains Jesus words and italics while hiding nested footnotes", () => {
    const html = renderVerse(
      "<j>Yesus <f>catatan <i>rahasia</i></f>berkata</j> <i>Amin</i>",
    );
    expect(html).toContain('class="bible-jw"');
    expect(html).toContain('class="bible-italic"');
    expect(html).toContain("Yesus berkata");
    expect(html).toContain("Amin");
    expect(html).not.toMatch(/catatan|rahasia/);
  });

  it("normalizes poetry breaks without blank first or last lines", () => {
    const html = renderVerse(
      "<pb/><t>Baris satu</t><pb/><pb/><t>Baris dua</t><pb/>",
    );
    expect(html).toBe(
      '<span class="bible-poetry">Baris satu</span><br/><span class="bible-poetry">Baris dua</span>',
    );
  });

  it("decodes entities as text and never turns decoded markup into HTML", () => {
    const html = renderVerse(
      "&lt;script&gt;alert(1)&lt;/script&gt; &amp; &#65; &#x1F64F;",
    );
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt; &amp; A 🙏");
    expect(html).not.toContain("<script>");
  });

  it("handles empty and hidden-only verses", () => {
    expect(renderVerse("")).toBe("");
    expect(renderVerse("<f>hidden</f>")).toBe("");
  });

  it("matches multiple literal search terms across styled segments", () => {
    const html = renderVerse("<j>Kasih</j> <i>A+B</i> kasih ab", "kasih a+b");
    expect(html.match(/<mark>/g)).toHaveLength(3);
    expect(html).toContain("<mark>A+B</mark>");
    expect(html).not.toContain("<mark>ab</mark>");
  });

  it("uses the same literal matching for search results and verse content", () => {
    const html = renderToStaticMarkup(
      createElement(HighlightedText, {
        text: "[Allah] ALLAH",
        query: "[Allah]",
      }),
    );
    expect(html).toContain("<mark>[Allah]</mark>");
    expect(html).not.toContain("<mark>ALLAH</mark>");
    expect(
      renderToStaticMarkup(
        createElement(HighlightedText, { text: "plain", query: "   " }),
      ),
    ).toBe("plain");
  });
});
