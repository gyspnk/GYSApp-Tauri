// @ts-nocheck - this DOM-typed package reads its own stylesheet through
// Node builtins (resolved at runtime by vitest); no @types/node dependency.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "styles.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(selector);
  if (start < 0) return "";
  const open = css.indexOf("{", start);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, i + 1);
    }
  }
  return "";
}

describe("Kidung viewer accent (gyschordweb parity, anti AI-slop)", () => {
  it("defines the viewer accent from the theme, falling back to sacred gold", () => {
    const scope = block("\n.hymn-detail-page {");
    expect(scope).toContain("--kidung-accent: var(--accent, #8d6e3f)");
    expect(scope).not.toContain("--kidung-accent: var(--blue)");
    expect(scope).not.toContain("--kidung-accent: #8d6e3f;");
  });

  it("marks the active Teks/PDF mode from the shared accent token", () => {
    const active = block(".hymn-mode-button.is-active {");
    expect(active).toContain("var(--kidung-accent)");
    expect(active).not.toContain("color: var(--blue)");
    expect(active).not.toContain("#8d6e3f");
  });

  it("lightens the accent for dark themes like the reference", () => {
    const dark = block(':root[data-theme="dark"] .hymn-detail-page,');
    expect(dark).toContain("var(--accent, #8d6e3f) 80%, #ffffff");
  });
});
