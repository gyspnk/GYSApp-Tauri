#!/usr/bin/env node
// Delete rules whose every class is dead, and drop dead parts of grouped
// selectors, from one stylesheet.
//
// `scripts/dead-css.mjs` only reports. Deleting by hand with regex and index
// arithmetic has gone wrong three times in this repo (a comment swallowed a
// rule's opening brace, a partial group lost its leading newline, a rebuild
// dropped every blank line). This tool keeps the decisions small: it blanks
// comments to equal-length spaces so indices stay valid, recurses into at-rule
// blocks, and edits the prelude of a grouped selector instead of guessing.
// Dropping a dead part cannot change what a live element matches — the dead
// selector matches nothing to begin with.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { deadClasses } from "./dead-css.mjs";

const BLANK = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (match) => " ".repeat(match.length));

const classesIn = (text) =>
  [...text.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map((match) => match[1]);

/** Split a selector list on commas that are not inside brackets/parens. */
export function selectorParts(selector) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < selector.length; index += 1) {
    const char = selector[index];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth -= 1;
    else if (char === "," && depth === 0) {
      parts.push(selector.slice(start, index));
      start = index + 1;
    }
  }
  parts.push(selector.slice(start));
  return parts;
}

/**
 * Classes a selector needs in order to match anything. A class inside
 * `:not()` or `:has()` is excluded: `:not(.gone)` still matches elements.
 */
export function requiredClasses(part) {
  let out = "";
  let index = 0;
  const pattern = /:(not|has)\(/g;
  while (index < part.length) {
    pattern.lastIndex = index;
    const found = pattern.exec(part);
    if (!found) {
      out += part.slice(index);
      break;
    }
    out += part.slice(index, found.index);
    let depth = 1;
    let cursor = found.index + found[0].length;
    while (cursor < part.length && depth > 0) {
      if (part[cursor] === "(") depth += 1;
      else if (part[cursor] === ")") depth -= 1;
      cursor += 1;
    }
    index = cursor;
  }
  return classesIn(out);
}

const isDead = (part, dead) => {
  const classes = requiredClasses(part);
  return classes.length > 0 && classes.some((name) => dead.has(name));
};

const FUNCTIONAL = ["is", "where", "not", "has"];

/**
 * Shrink the argument lists of `:is()`, `:where()`, `:not()` and `:has()`.
 * A dead argument matches nothing, so dropping it cannot change which live
 * elements match; a function left with no arguments matches nothing at all,
 * so its selector is dropped by returning `null`.
 */
export function shrinkPart(part, dead) {
  let out = "";
  let index = 0;
  const pattern = new RegExp(`:(${FUNCTIONAL.join("|")})\\(`, "g");
  while (index < part.length) {
    pattern.lastIndex = index;
    const found = pattern.exec(part);
    if (!found) {
      out += part.slice(index);
      break;
    }
    out += part.slice(index, found.index);
    const open = found.index + found[0].length;
    let depth = 1;
    let cursor = open;
    while (cursor < part.length && depth > 0) {
      if (part[cursor] === "(") depth += 1;
      else if (part[cursor] === ")") depth -= 1;
      cursor += 1;
    }
    const inner = part.slice(open, cursor - 1);
    const kept = selectorParts(inner)
      .map((argument) => argument.trim())
      .map((argument) => shrinkPart(argument, dead))
      .filter((argument) => argument !== null && argument !== "")
      .filter((argument) => !isDead(argument, dead));
    if (kept.length === 0) {
      // An empty :is()/:where() matches nothing, so the selector goes.
      // An empty :not()/:has() matches everything, so only the function goes.
      if (found[1] === "is" || found[1] === "where") return null;
      index = cursor;
      continue;
    }
    // `:is(x)` has exactly x's specificity, so one survivor needs no wrapper.
    out +=
      found[1] === "is" && kept.length === 1
        ? kept[0]
        : `:${found[1]}(${kept.join(", ")})`;
    index = cursor;
  }
  return out;
}

/**
 * Edits, in source order: `[start, end, replacement]`. `replacement === ""`
 * removes the whole rule; anything else replaces that slice (a shrunk prelude).
 */
export function deadRuleRanges(css, dead) {
  const blanked = BLANK(css);
  const cuts = [];
  const scan = (from, to) => {
    let index = from;
    while (index < to) {
      while (index < to && /\s/.test(blanked[index])) index += 1;
      if (index >= to) return;
      let cursor = index;
      while (
        cursor < to &&
        blanked[cursor] !== "{" &&
        blanked[cursor] !== ";"
      ) {
        cursor += 1;
      }
      if (cursor >= to) return;
      if (blanked[cursor] === ";") {
        index = cursor + 1;
        continue;
      }
      const prelude = blanked.slice(index, cursor);
      let depth = 1;
      let end = cursor + 1;
      while (end < to && depth > 0) {
        if (blanked[end] === "{") depth += 1;
        else if (blanked[end] === "}") depth -= 1;
        end += 1;
      }
      if (prelude.trimStart().startsWith("@")) {
        scan(cursor + 1, end - 1);
      } else if (prelude.trim().length > 0) {
        const parts = selectorParts(prelude);
        const live = [];
        let changed = false;
        for (const part of parts) {
          const trimmed = part.trim();
          const shrunk = shrinkPart(trimmed, dead);
          if (shrunk === null || isDead(shrunk, dead)) {
            changed = true;
            continue;
          }
          if (shrunk !== trimmed) changed = true;
          live.push(shrunk);
        }
        if (live.length === 0) {
          cuts.push([index, end, ""]);
        } else if (changed) {
          // Keep the space before "{" so the prelude still reads as CSS.
          const tail = /\s$/.test(prelude) ? " " : "";
          cuts.push([index, cursor, live.join(",\n") + tail]);
        }
      }
      index = end;
    }
  };
  scan(0, blanked.length);
  return cuts;
}

export function pruneCss(css, dead) {
  let out = css;
  for (const [start, end, replacement] of deadRuleRanges(css, dead).reverse()) {
    out = out.slice(0, start) + replacement + out.slice(end);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node scripts/prune-dead-css.mjs <file.css> [--dry]");
    process.exit(1);
  }
  const dead = new Set(
    (await deadClasses(process.cwd())).map(({ name }) => name),
  );
  const css = await readFile(target, "utf8");
  const edits = deadRuleRanges(css, dead);
  const lines = css.split("\n").length;
  const next = pruneCss(css, dead);
  const remaining = next.split("\n").length;
  if (!process.argv.includes("--dry")) await writeFile(target, next);
  process.stdout.write(
    `${target}: ${edits.length} edit(s), ${lines} -> ${remaining} lines${
      process.argv.includes("--dry") ? " (dry run)" : ""
    }\n`,
  );
}
