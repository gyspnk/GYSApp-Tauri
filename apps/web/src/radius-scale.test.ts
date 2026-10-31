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
});
