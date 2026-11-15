// @ts-expect-error Vitest runs in Node, but the web tsconfig does not load Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * Both of these surfaces used to end in a sentence: the search error told the
 * reader to reload the app without offering it, and the literature card said
 * the PDF was unavailable with no way to ask again. A dead end is a bug even
 * when the copy is honest, so the controls are pinned here.
 */
describe("error surfaces offer the action they name", () => {
  it("gives the search error a title and a reload control", () => {
    const source = read("./global-search.tsx");
    const start = source.indexOf('status === "error" &&');
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(
      start,
      source.indexOf("mergedResults.length", start),
    );
    expect(block).toContain("search.errorTitle");
    expect(block).toContain("search.reload");
    expect(block).toContain("window.location.reload()");
  });

  it("lets the literature card retry the PDF it could not load", () => {
    const source = read("./literature.tsx");
    const start = source.indexOf("literature-reader-error");
    expect(start).toBeGreaterThan(-1);
    const block = source.slice(
      start,
      source.indexOf("literature-reading-panel", start),
    );
    expect(block).toContain("pdf.retry");
    expect(block).toContain("setSourceAttempt");
  });
});
