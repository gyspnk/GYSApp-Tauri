import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync, readdirSync } from "node:fs";

// Lightning CSS drops the unprefixed `backdrop-filter` when it follows no
// prefix, and Chromium 151 no longer accepts the `-webkit-` alias: the blur
// silently disappears. The pair must stay `-webkit-` first so both properties
// survive minification.
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

describe("backdrop-filter order", () => {
  it("declares the prefixed property before the standard one", () => {
    const offenders: string[] = [];
    for (const file of cssFiles()) {
      const css = readFileSync(new URL(file, SRC), "utf8");
      const blocks = css.split("}");
      for (const block of blocks) {
        const standard = block.indexOf("backdrop-filter:");
        const prefixed = block.indexOf("-webkit-backdrop-filter:");
        // Both inside one declaration block: the prefixed property must come
        // first, otherwise the standard one is minified away.
        if (standard >= 0 && prefixed > standard) {
          offenders.push(`${file}: ${block.trim().slice(0, 90)}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
