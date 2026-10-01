// @ts-nocheck - design-contract test reads source text via Node builtins.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const main = readFileSync(join(__dirname, "main.tsx"), "utf8");
const readingPath = join(__dirname, "reading-surfaces.css");
const reading = readFileSync(readingPath, "utf8");
const styles = readFileSync(join(__dirname, "styles.css"), "utf8").replace(
  /@import "([^"]+)";/g,
  (_, relative) => readFileSync(join(__dirname, relative), "utf8"),
);

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

  it("loads reading surfaces before the final calm authority", () => {
    const readingImport = main.indexOf('import "./reading-surfaces.css";');
    const calm = main.indexOf('import "./calm-liturgical.css";');
    expect(readingImport).toBeGreaterThan(
      main.indexOf('import "./direct-manipulation.css";'),
    );
    expect(readingImport).toBeLessThan(calm);
  });

  it("keeps active reading-family ownership out of the legacy base layer", () => {
    expect(reading).toContain(".literature-row");
    expect(reading).toContain(".faith-rows");
    expect(styles).not.toContain(".literature-row {");
    expect(styles).not.toContain(".faith-rows {");
  });
});
