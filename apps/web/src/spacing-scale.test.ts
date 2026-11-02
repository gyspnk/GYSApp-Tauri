import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync, readdirSync } from "node:fs";

// Spacing follows one 2 px grid: every step up to 24 px is even, and larger
// steps are multiples of four. Odd values (3/5/7/9/11/13/15/17/19/21) were the
// single biggest source of "almost aligned" surfaces, so this test fails on any
// new off-grid declaration instead of letting the drift return.
const PROPS = [
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "padding-inline",
  "padding-inline-start",
  "padding-inline-end",
  "padding-block",
  "padding-block-start",
  "padding-block-end",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin-inline",
  "margin-inline-start",
  "margin-inline-end",
  "margin-block",
  "margin-block-start",
  "margin-block-end",
  "gap",
  "row-gap",
  "column-gap",
];
const PROP_RE = new RegExp(
  `(?:^|[;{\\s])(${PROPS.join("|")})\\s*:\\s*([^;}]+)`,
  "g",
);
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

export function onSpacingGrid(pixels: number): boolean {
  if (pixels <= 0) return true;
  return pixels <= 24 ? pixels % 2 === 0 : pixels % 4 === 0;
}

describe("spacing scale", () => {
  it("keeps every literal padding, margin, and gap on the 2 px grid", () => {
    const offenders: string[] = [];
    for (const file of cssFiles()) {
      const css = readFileSync(new URL(file, SRC), "utf8");
      for (const match of css.matchAll(PROP_RE)) {
        const prop = match[1];
        const value = match[2].trim();
        // Relative and computed lengths are not part of the fixed grid.
        if (/\b(var|calc|clamp|min|max|env)\s*\(/.test(value)) continue;
        for (const number of value.matchAll(
          /(?<![\w.-])(-?)([\d.]+)(px|rem)/g,
        )) {
          if (number[1] === "-") continue; // optical negative offsets stay allowed
          const pixels = Number(number[2]) * (number[3] === "rem" ? 16 : 1);
          if (!onSpacingGrid(pixels))
            offenders.push(`${file} ${prop}: ${value}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("rejects a new odd step", () => {
    // Failing-first proof lives here: 7 px is exactly the kind of value the
    // sweep removed, so the predicate must call it out.
    expect(onSpacingGrid(7)).toBe(false);
    expect(onSpacingGrid(13)).toBe(false);
    expect(onSpacingGrid(30)).toBe(false);
    expect(onSpacingGrid(8)).toBe(true);
    expect(onSpacingGrid(24)).toBe(true);
    expect(onSpacingGrid(28)).toBe(true);
  });
});
