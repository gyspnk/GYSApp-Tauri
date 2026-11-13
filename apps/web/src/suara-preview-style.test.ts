// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The last two paragraphs of a testimony are centred and italic. An article that
// only carries its excerpt (the preview after a failed fetch) has no closing
// lines, so that treatment turned the whole body italic and centred.
const css = readFileSync(
  new URL("./styles/01-foundations-and-layout.css", import.meta.url),
  "utf8",
);
const component = readFileSync(
  new URL("./online-content.tsx", import.meta.url),
  "utf8",
);

describe("suara preview body", () => {
  it("marks a preview article so the closing-line style can skip it", () => {
    expect(component).toContain(
      'data-preview={state.previewOnly ? "true" : undefined}',
    );
  });

  it("scopes the closing-line style to a full article", () => {
    expect(css).toContain('.suara-article-card:not([data-preview="true"])');
  });
});
