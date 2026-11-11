#!/usr/bin/env node
// Report class selectors that browser tests still query but nothing renders.
//
// Replacing a control (a dropdown that became a chip row, a select that became
// a group) leaves the spec behind, and the failure only shows up as a 5-second
// timeout inside a hosted Playwright run — three times in one session here.
// This scans the literal selector strings passed to locator/querySelector and
// checks each class against the stylesheets and the markup. It is deliberately
// one-directional: a hit means "the test waits for something no file declares".
//
// Report only. A selector can legitimately target a third-party widget or a
// class written at runtime; read the list, do not delete blindly.
import { readdir, readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "coverage",
  "test-results",
  "playwright-report",
  ".git",
  ".turbo",
]);

const QUERY =
  /\b(?:locator|querySelector|querySelectorAll|waitForSelector|\$|\$\$)\s*\(\s*(["'`])((?:\\.|(?!\1)[\s\S])*?)\1\s*[,)]/g;
const CLASS_TOKEN = /\.(-?[_a-zA-Z][\w-]*)/g;

/** Class names a spec asks for, keyed by the spec file that asks. */
export function queriedClasses(source) {
  const found = new Map();
  for (const match of source.matchAll(QUERY)) {
    const selector = match[2];
    // "the old control is gone" assertions query a class on purpose.
    const window = source.slice(match.index, match.index + 200);
    if (
      /toHaveCount\(\s*0/.test(window) ||
      /count\(\)\)\.(?:toBe|toEqual)\(0\)/.test(window)
    )
      continue;
    // ".a, button[aria-label]" means "either one"; an attribute part that is not
    // a class proves nothing about our markup.
    if (
      selector.includes(",") &&
      selector.split(",").some((part) => !part.includes("."))
    )
      continue;
    // Only selector-looking strings; skip ids, attributes and plain text.
    if (!selector.includes(".")) continue;
    for (const token of selector.matchAll(CLASS_TOKEN)) {
      const name = token[1];
      // A dotted filename or a decimal is not a class.
      if (
        /^\d/.test(name) ||
        name === "ts" ||
        name === "js" ||
        name === "css" ||
        name === "png"
      )
        continue;
      found.set(name, true);
    }
  }
  return [...found.keys()];
}

/**
 * Every class name the app declares: CSS selectors, markup attributes, and any
 * name that appears as a word in a script (classList.add("..."), state maps,
 * template literals).
 */
export async function declaredClasses(root) {
  const declared = new Set();
  const text = [];
  await walk(join(root, "apps/web/src"), declared, text);
  return { declared, text: text.join("\n") };
}

async function walk(dir, declared, text) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) await walk(full, declared, text);
      continue;
    }
    if (!/\.(css|tsx?|jsx?|html|svg)$/.test(entry.name)) continue;
    const source = await readFile(full, "utf8");
    if (entry.name.endsWith(".css")) {
      for (const token of source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .matchAll(CLASS_TOKEN))
        declared.add(token[1]);
      continue;
    }
    text.push(source);
    // Markup: class="a b", className="a b", clsx("a b"), template literals with words.
    for (const match of source.matchAll(
      /(?:class|className)\s*=\s*(?:"([^"]*)"|'([^']*)'|\{`([^`]*)`\}|\{"([^"]*)"\})/g,
    )) {
      const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? "";
      for (const name of value.split(/[\s{}()?:'"`[\]|&!]+/)) {
        if (/^-?[_a-zA-Z][\w-]*$/.test(name)) declared.add(name);
      }
    }
  }
}

/** Specs whose literal selectors name a class nothing declares. */
export async function orphanSelectors(root) {
  const { declared, text: sourceText } = await declaredClasses(root);
  const specDir = join(root, "apps/web/e2e");
  const offenders = [];
  for (const entry of await readdir(specDir, { withFileTypes: true })) {
    if (!entry.isFile() || !/\.(spec|ts)$/.test(entry.name)) continue;
    const file = join(specDir, entry.name);
    const text = await readFile(file, "utf8");
    const missing = queriedClasses(text).filter(
      (name) =>
        !declared.has(name) && !new RegExp(`\\b${name}\\b`).test(sourceText),
    );
    if (missing.length > 0)
      offenders.push({ file: `apps/web/e2e/${entry.name}`, classes: missing });
  }
  return offenders;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const offenders = await orphanSelectors(process.cwd());
  if (offenders.length === 0) {
    console.log("No orphan selectors in the browser contracts.");
  } else {
    for (const { file, classes } of offenders) {
      console.log(`${file} (${classes.length})`);
      for (const name of classes) console.log(`  .${name}`);
    }
    const total = offenders.reduce((sum, item) => sum + item.classes.length, 0);
    console.log(
      `\n${total} class selector(s) queried by tests but declared nowhere.`,
    );
  }
}
