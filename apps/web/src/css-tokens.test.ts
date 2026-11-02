import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync, readdirSync } from "node:fs";

// A `var(--name)` with no declaration computes to `unset`: the property silently
// disappears. That is how the e-GYS member badge lost its gold frame and the
// media surface lost its shadow. This test keeps every reference backed by a
// declaration in CSS or by a literal name assigned from TypeScript.
const SRC = new URL("./", import.meta.url);

function listByExtension(extension: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(SRC, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(extension))
      files.push(entry.name);
  }
  const styles = new URL("./styles/", SRC);
  for (const entry of readdirSync(styles, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(extension))
      files.push(`styles/${entry.name}`);
  }
  return files;
}

const cssFiles = listByExtension(".css");
const defined = new Set<string>();
const used = new Map<string, Set<string>>();

for (const file of cssFiles) {
  const css = readFileSync(new URL(file, SRC), "utf8");
  for (const match of css.matchAll(/(--[a-zA-Z0-9-]+)\s*:/g)) {
    defined.add(match[1]);
  }
  for (const match of css.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)) {
    if (!used.has(match[1])) used.set(match[1], new Set());
    used.get(match[1])!.add(file);
  }
}

// Inline styles and imperative setters declare their properties as string
// literals, so the same scan catches them.
for (const file of [...listByExtension(".ts"), ...listByExtension(".tsx")]) {
  const source = readFileSync(new URL(file, SRC), "utf8");
  for (const match of source.matchAll(/["'](--[a-zA-Z0-9-]+)["']/g)) {
    defined.add(match[1]);
  }
}

describe("css custom properties", () => {
  it("declares every variable a stylesheet reads", () => {
    const missing = [...used.entries()]
      .filter(([name]) => !defined.has(name))
      .map(([name, files]) => `${name} (${[...files].join(", ")})`);
    expect(missing).toEqual([]);
  });
});
