// @ts-expect-error Vitest runs in Node, but the web tsconfig does not load Node types.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

/**
 * The warning colour is a token so it can follow the shell: light keeps a dark
 * gold, dark and amoled need a pale one, sepia a muted brown. A literal hex
 * froze every error border at the light value.
 */
describe("error surfaces", () => {
  const sheets = [
    "./styles/01-foundations-and-layout.css",
    "./styles/02-bible-and-settings.css",
  ].map((path) => [path, read(path)] as const);

  it("paints error borders with the gold token, not a literal", () => {
    for (const [path, css] of sheets) {
      expect(css, `${path} still paints a literal gold`).not.toMatch(
        /#b98132/i,
      );
    }
    const foundations = sheets[0]![1];
    expect(foundations).toMatch(
      /\.error-panel\s*\{[^}]*border-color:\s*color-mix\(in srgb, var\(--gold\)/,
    );
  });

  it("lets a quiet retry button sit at its own width", () => {
    const foundations = sheets[0]![1];
    const rule = foundations.slice(
      foundations.indexOf(".error-panel .primary-button,"),
    );
    expect(rule.slice(0, rule.indexOf("}"))).toContain(
      ".error-panel .quiet-button",
    );
  });
});
