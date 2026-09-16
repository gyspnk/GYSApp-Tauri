// @ts-nocheck - design-contract test reads source text via Node builtins.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(join(__dirname, "main.tsx"), "utf8");
const kidung = readFileSync(join(__dirname, "kidung-ux.css"), "utf8");
const kidungSource = readFileSync(join(__dirname, "kidung.tsx"), "utf8");

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

  it("keeps PDF song navigation visible for pointer and touch users", () => {
    expect(kidungSource).toContain(
      'aria-label={translate(locale, "kidung.previous")}',
    );
    expect(kidungSource).toContain(
      'aria-label={translate(locale, "kidung.next")}',
    );
    expect(kidungSource).toContain(
      'aria-label={translate(locale, "kidung.pdfNavigation")}',
    );
  });

  it("does not render an empty music disclosure for PDF-only hymns", () => {
    expect(kidungSource).toContain("{(midiAvailable || !item.assetCode) && (");
  });

  it("routes contextual Kidung labels through the locale table", () => {
    expect(kidungSource).not.toContain('aria-label="Opsi musik"');
    expect(kidungSource).not.toContain('aria-label="Pengaturan baca"');
    expect(kidungSource).not.toContain("<summary>Teks & jarak</summary>");
    expect(kidungSource).not.toContain("<summary>Musik & chord</summary>");
  });

  it("keeps nested reader menus from clipping custom Select options", () => {
    const settingsGroup = block(kidung, ".reader-settings-group {");
    expect(settingsGroup).toContain("overflow: visible");
  });

  it("overrides the legacy PDF mobile grid with equal specificity", () => {
    expect(kidung).toContain(
      ".hymn-detail-page.is-pdf-viewer .hymn-pdf-viewer-chrome {",
    );
    expect(kidung).toContain(
      "grid-template-columns: 44px 44px minmax(0, 1fr) 44px 44px;",
    );
  });
});
