import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync, readdirSync } from "node:fs";

// Five rules shipped `box-shadow: var(--shadow-xs|sm)` for months while neither
// token existed: an undefined var computes to `unset`, so those cards simply had
// no shadow at all. This test fails on any shadow reference the token layer does
// not define, and on a theme that forgets the elevation scale.
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

const tokens = readFileSync(new URL("styles/00-tokens.css", SRC), "utf8");

describe("shadow tokens", () => {
  it("defines every shadow a stylesheet references", () => {
    const defined = new Set(
      [...tokens.matchAll(/--shadow-[a-z-]+(?=:)/g)].map((match) => match[0]),
    );
    const missing: string[] = [];
    for (const file of cssFiles()) {
      if (file === "styles/00-tokens.css") continue;
      const css = readFileSync(new URL(file, SRC), "utf8");
      for (const match of css.matchAll(/var\((--shadow-[a-z-]+)/g)) {
        if (!defined.has(match[1])) missing.push(`${file}: ${match[1]}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("gives every theme the three elevation tokens", () => {
    // Light root, dark, system-dark, amoled and sepia all retint the scale.
    const counts = ["--shadow-xs", "--shadow-sm", "--shadow-float"].map(
      (token) => (tokens.match(new RegExp(`${token}:`, "g")) ?? []).length,
    );
    expect(counts).toEqual([5, 5, 5]);
  });
});
