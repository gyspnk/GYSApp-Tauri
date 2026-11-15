// @ts-expect-error Vitest runs in Node, but the web tsconfig does not load Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * A page-shaped route keeps the shell's height while its chunk arrives; the
 * reader shell only needs room for a spinner. A later sheet resetting the
 * first to 180 px made every catalogue jump about half a screen on landing.
 */
describe("route loading reserve", () => {
  it("keeps the page-shaped reserve in the foundations sheet", () => {
    const css = read("./styles/01-foundations-and-layout.css");
    const start = css.indexOf(".non-reader-route-loading {");
    expect(start).toBeGreaterThan(-1);
    const rule = css.slice(start, css.indexOf("}", start));
    expect(rule).toContain("min-height: min(680px");
  });

  it("does not let a later sheet shrink the page-shaped reserve", () => {
    const css = read("./app-design.css");
    const blocks = [
      ...css.matchAll(/[^{}]*\.non-reader-route-loading[^{}]*\{[^}]*\}/g),
    ];
    for (const block of blocks) {
      expect(block[0]).not.toMatch(/min-height:\s*(?:180px|0)\s*;/);
    }
    expect(css).toMatch(/\.reader-route-loading\s*\{[^}]*min-height:\s*180px/);
  });
});
