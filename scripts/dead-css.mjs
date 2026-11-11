#!/usr/bin/env node
// Report class selectors that no source file mentions any more.
//
// The stylesheets here outlived several design rounds, and a renamed class
// leaves its rules behind where they can still leak generic properties
// (margin, display) onto whatever now carries that element. Grep cannot answer
// this: a class is alive when it appears *without* a leading dot in markup,
// and dead when it only ever appears as a CSS selector.
//
// Report only, on purpose: deleting a rule changes what the browser paints, so
// a human or an agent reads the list and removes rules in a reviewed commit.
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".git",
  ".turbo",
  // Docs quote class names while describing old work; that is not a use.
  "docs",
]);

const SOURCE_EXT = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".html",
  ".svg",
  ".json",
];

/** Class selectors declared by a stylesheet, comments stripped. */
export function classesInCss(css) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const found = new Set();
  for (const match of bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) {
    found.add(match[1]);
  }
  return found;
}

/** Every class name mentioned outside the stylesheets, as one blob. */
export function mentionsIn(files) {
  return files.map(({ text }) => text).join("\n");
}

/**
 * Prefixes that a template literal can complete at runtime.
 *
 * `className={`is-${color}`}` never spells `is-blue`, so a plain grep would
 * call those rules dead and delete colours that are still painted. Anything
 * whose name starts with a captured prefix stays alive.
 */
export function dynamicPrefixes(files) {
  const prefixes = new Set();
  for (const { text } of files) {
    for (const match of text.matchAll(/([A-Za-z][\w-]*?)-\$\{/g)) {
      prefixes.add(`${match[1]}-`);
    }
  }
  return prefixes;
}

async function walk(dir, out) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      await walk(join(dir, entry.name), out);
      continue;
    }
    out.push(join(dir, entry.name));
  }
  return out;
}

/** Classes declared in CSS but mentioned in no other file. */
export async function deadClasses(root) {
  const paths = await walk(root, []);
  const styles = paths.filter((path) => path.endsWith(".css"));
  const sources = paths.filter((path) =>
    SOURCE_EXT.some((extension) => path.endsWith(extension)),
  );
  const declared = new Map();
  for (const path of styles) {
    const css = await readFile(path, "utf8");
    for (const name of classesInCss(css)) {
      const files = declared.get(name) ?? new Set();
      files.add(relative(root, path));
      declared.set(name, files);
    }
  }
  const sourcesWithText = await Promise.all(
    sources.map(async (path) => ({ text: await readFile(path, "utf8") })),
  );
  const text = mentionsIn(sourcesWithText);
  const prefixes = dynamicPrefixes(sourcesWithText);
  return [...declared]
    .filter(([name]) => !text.includes(name))
    .filter(
      ([name]) => ![...prefixes].some((prefix) => name.startsWith(prefix)),
    )
    .map(([name, files]) => ({ name, files: [...files].sort() }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

// A plain string compare breaks as soon as the checkout path has a
// space, so compare resolved URLs.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const root = process.cwd();
  const dead = await deadClasses(root);
  if (process.argv.includes("--json")) {
    process.stdout.write(`${JSON.stringify(dead, null, 2)}\n`);
  } else if (dead.length === 0) {
    console.log("No dead class selectors.");
  } else {
    const byFile = new Map();
    for (const { name, files } of dead) {
      for (const file of files) {
        const names = byFile.get(file) ?? [];
        names.push(name);
        byFile.set(file, names);
      }
    }
    for (const file of [...byFile.keys()].sort()) {
      const names = byFile.get(file);
      console.log(`${file} (${names.length})`);
      for (const name of names) console.log(`  .${name}`);
    }
    console.log(`\n${dead.length} class selector(s) with no markup mention.`);
  }
}
