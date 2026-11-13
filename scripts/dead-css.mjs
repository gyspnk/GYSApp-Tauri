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
import { execFileSync } from "node:child_process";
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
 * Which of `names` appear anywhere in `text`.
 *
 * `String.includes` was the whole cost of this scan: 917 names against a
 * 15.6 MB blob took 69 s on UTF-16 strings, while `Buffer.indexOf` over the
 * same bytes takes 2.9 s (measured 13 Nov). The answer is identical — both are
 * plain substring searches — so the class list does not change.
 */
export function mentionedNames(text, names) {
  const haystack = Buffer.from(text, "utf8");
  const alive = new Set();
  for (const name of names) {
    if (haystack.indexOf(name) >= 0) alive.add(name);
  }
  return alive;
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

/**
 * Files git would check out. A scratch file that is gitignored must not be
 * able to hide a dead selector locally and then fail the same check in CI.
 */
export function trackedFiles(root) {
  try {
    const output = execFileSync("git", ["ls-files", "-z"], {
      cwd: root,
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "ignore"],
    });
    const listed = output
      .toString("utf8")
      .split("\0")
      .filter(Boolean)
      .map((path) => join(root, path));
    const usable = listed.filter((path) => {
      const parts = relative(root, path).split("/");
      return !parts.some((part) => SKIP_DIRS.has(part)) && parts[0] !== "docs";
    });
    return usable.length > 0 ? usable : null;
  } catch {
    return null;
  }
}

/** Classes declared in CSS but mentioned in no other file. */
export async function deadClasses(root) {
  const paths = trackedFiles(root) ?? (await walk(root, []));
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
  const alive = mentionedNames(text, declared.keys());
  return [...declared]
    .filter(([name]) => !alive.has(name))
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
  // `--check` fails the build so a renamed class cannot leave rules behind.
  if (process.argv.includes("--check") && dead.length > 0) process.exit(1);
}
