import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync, readdirSync } from "node:fs";

// Absolute font sizes come from one short scale (mirrored by --type-* tokens in
// styles/00-tokens.css). Relative values (em, %, clamp, calc, var) are allowed
// because they inherit from the step they sit on.
const SCALE = new Set([
  0, 0.625, 0.6875, 0.75, 0.8125, 0.875, 0.9375, 1, 1.0625, 1.125, 1.25, 1.375,
  1.5, 1.75,
]);
const SRC = new URL("./", import.meta.url);

function cssFiles(): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".css")) files.push(entry.name);
  }
  const styles = new URL("./styles/", SRC);
  for (const entry of readdirSync(styles, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".css"))
      files.push(`styles/${entry.name}`);
  }
  return files;
}

function toRem(value: string): number | undefined {
  if (value === "0") return 0;
  const rem = /^([\d.]+)rem$/.exec(value);
  if (rem) return Number(rem[1]);
  const px = /^([\d.]+)px$/.exec(value);
  if (px) return Number(px[1]) / 16;
  return undefined;
}

describe("type scale", () => {
  it("keeps every absolute font size on the shared scale", () => {
    const offenders: string[] = [];
    for (const file of cssFiles()) {
      const css = readFileSync(new URL(file, SRC), "utf8");
      for (const match of css.matchAll(/font-size:\s*([^;]+);/g)) {
        const value = match[1].trim().replace(/\s*!important$/, "");
        // Relative expressions inherit from their context, so only bare rem/px
        // values are expected to snap to a scale step.
        const absolute = value.replace(/rem/g, "");
        if (
          /em|%|var\(|calc\(|clamp\(|min\(|max\(|inherit|unset|initial/.test(
            absolute,
          )
        ) {
          continue;
        }
        const rem = toRem(value);
        if (rem === undefined || !SCALE.has(rem)) {
          offenders.push(`${file}: font-size: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every type token on the shared scale", () => {
    const tokens = readFileSync(new URL("styles/00-tokens.css", SRC), "utf8");
    const offenders: string[] = [];
    for (const match of tokens.matchAll(/--type-[a-z-]+:\s*([\d.]+)rem/g)) {
      if (!SCALE.has(Number(match[1])))
        offenders.push(`styles/00-tokens.css ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
