// @ts-nocheck - design-contract test reads source text via Node builtins.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(join(__dirname, "main.tsx"), "utf8");
const stylesRaw = readFileSync(join(__dirname, "styles.css"), "utf8");
const foundations = readFileSync(
  join(__dirname, "styles/01-foundations-and-layout.css"),
  "utf8",
);
const reading = readFileSync(
  join(__dirname, "styles/03-home-and-catalogs.css"),
  "utf8",
);

describe("visual layer authority", () => {
  it("loads the single consolidated styles.css entrypoint from main.tsx", () => {
    expect(main).toContain('import "./styles.css";');
    expect(stylesRaw).toContain('@import "./styles/00-tokens.css";');
    expect(stylesRaw).toContain('@import "./styles/05-motion-and-print.css";');
  });

  it("loads styles/00 through styles/05 in deterministic cascade order", () => {
    const layers = [
      "00-tokens.css",
      "01-foundations-and-layout.css",
      "02-bible-and-settings.css",
      "03-home-and-catalogs.css",
      "04-kidung-and-media.css",
      "05-motion-and-print.css",
    ];
    let lastIndex = -1;
    for (const layer of layers) {
      const idx = stylesRaw.indexOf(layer);
      expect(idx).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("keeps active reading-family ownership out of the foundations layer", () => {
    expect(reading).toContain(".literature-row");
    expect(reading).toContain(".faith-rows");
    expect(foundations).not.toContain(".literature-row {");
    expect(foundations).not.toContain(".faith-rows {");
  });
});
