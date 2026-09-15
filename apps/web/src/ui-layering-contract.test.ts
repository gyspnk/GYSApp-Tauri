// @ts-nocheck - design-contract test reads source text via Node builtins.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(join(__dirname, "main.tsx"), "utf8");
const kidung = readFileSync(join(__dirname, "kidung-ux.css"), "utf8");

function block(source: string, selector: string): string {
  const start = source.indexOf(selector);
  if (start < 0) return "";
  const open = source.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return "";
}

describe("visual layer authority", () => {
  it("loads the shared calm refinement after every feature style layer", () => {
    const calm = main.indexOf('import "./calm-liturgical.css";');
    expect(calm).toBeGreaterThan(main.indexOf('import "./styles.css";'));
    expect(calm).toBeGreaterThan(main.indexOf('import "./ui-hardening.css";'));
    expect(calm).toBeGreaterThan(
      main.indexOf('import "./ui-preferences.css";'),
    );
    expect(calm).toBeGreaterThan(main.indexOf('import "./kidung-ux.css";'));
    expect(calm).toBeGreaterThan(
      main.indexOf('import "./direct-manipulation.css";'),
    );
  });

  it("keeps hymn catalog rows flat instead of turning the library into cards", () => {
    const row = block(kidung, ".hymn-page .pujian-item {");
    expect(row).toContain("border: 0");
    expect(row).toContain("border-radius: 0");
    expect(row).toContain("background: transparent");

    const interactive = block(kidung, ".hymn-page .pujian-item:hover,");
    expect(interactive).toContain("box-shadow: none");
    expect(interactive).toContain("transform: none");
  });

  it("keeps persistent Kidung controls free of decorative lift effects", () => {
    const localLink = block(kidung, ".kidung-local-nav a {");
    expect(localLink).not.toContain("transform");

    const primary = block(
      kidung,
      ".hymn-text-toolbar .detail-actions .hymn-action-primary {",
    );
    expect(primary).toContain("box-shadow: none");
  });
});
