import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync, readdirSync } from "node:fs";

// The UI deliberately ships one short radius scale. A one-off value reads as a
// different design language next to its neighbours, so this test fails on any
// new off-scale declaration instead of letting the drift return.
const SCALE = new Set([0, 6, 8, 10, 12, 16, 24, 999]);
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

describe("radius scale", () => {
  it("keeps every border radius on the shared scale", () => {
    const offenders: string[] = [];
    for (const file of cssFiles()) {
      const css = readFileSync(new URL(file, SRC), "utf8");
      for (const match of css.matchAll(/border-radius:\s*([1-9]\d*)px/g)) {
        const value = Number(match[1]);
        if (!SCALE.has(value)) offenders.push(`${file}: ${value}px`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("does not hide a stray radius behind rem units", () => {
    // The first sweep only looked at `px`, so twelve cards kept values such as
    // 0.95rem (15.2px) and 1.2rem (19.2px) that never matched the scale.
    const offenders: string[] = [];
    for (const file of cssFiles()) {
      const css = readFileSync(new URL(file, SRC), "utf8");
      for (const match of css.matchAll(/border-radius:\s*([\d.]+)rem/g)) {
        const pixels = Number(match[1]) * 16;
        if (!SCALE.has(pixels)) offenders.push(`${file}: ${match[1]}rem`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("keeps every radius token on the shared scale", () => {
    // Declarations were normalised first, but the token layer kept its own
    // stray values (--radius-sm: 5px, --radius-feature: 20px). Guard it too so
    // a token cannot reintroduce what the declaration test already rejects.
    const tokens = readFileSync(new URL("styles/00-tokens.css", SRC), "utf8");
    const offenders: string[] = [];
    for (const match of tokens.matchAll(/--radius-[a-z-]+:\s*(\d+)px/g)) {
      const value = Number(match[1]);
      if (!SCALE.has(value)) offenders.push(`styles/00-tokens.css ${match[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});
