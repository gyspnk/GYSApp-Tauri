#!/usr/bin/env node
// Delete rules whose every class is dead, from one stylesheet.
//
// `scripts/dead-css.mjs` only reports. Deleting by hand with regex and index
// arithmetic has gone wrong three times in this repo (a comment swallowed a
// rule's opening brace, a partial group lost its leading newline, a rebuild
// dropped every blank line). This tool keeps the decisions small: it blanks
// comments to equal-length spaces so indices stay valid, recurses into at-rule
// blocks, and only cuts a rule when *all* of its classes are dead. A grouped
// selector with one live class survives untouched on purpose.
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { deadClasses } from "./dead-css.mjs";

const BLANK = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, (match) => " ".repeat(match.length));

/** [start, end) slices to delete, in source order. */
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
      } else {
        const classes = [...prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)].map(
          (match) => match[1],
        );
        if (classes.length > 0 && classes.every((name) => dead.has(name))) {
          cuts.push([index, end]);
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
  for (const [start, end] of deadRuleRanges(css, dead).reverse()) {
    out = out.slice(0, start) + out.slice(end);
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const target = process.argv[2];
  if (!target) {
    console.error("usage: node scripts/prune-dead-css.mjs <file.css> [--dry]");
    process.exit(1);
  }
  const dead = new Set(
    (await deadClasses(process.cwd())).map(({ name }) => name),
  );
  const css = await readFile(target, "utf8");
  const ranges = deadRuleRanges(css, dead);
  const lines = css.split("\n").length;
  const next = pruneCss(css, dead);
  const remaining = next.split("\n").length;
  if (!process.argv.includes("--dry")) await writeFile(target, next);
  process.stdout.write(
    `${target}: ${ranges.length} rule(s), ${lines} -> ${remaining} lines${
      process.argv.includes("--dry") ? " (dry run)" : ""
    }\n`,
  );
}
