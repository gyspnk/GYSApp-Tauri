#!/usr/bin/env node
/**
 * Finds app modules that nothing imports.
 *
 * `dead-css` catches a class whose markup is gone; this catches a whole module
 * whose import is gone. A real example: `apps/web/src/kidung-midi-controls.tsx`
 * survived 189 lines and four stylesheet blocks after the media dock replaced
 * it, because nothing ever trimmed it and `dead-css` still saw its class names
 * in the leftover source.
 *
 * Only static imports, dynamic `import("…")` and `new URL("…", import.meta.url)`
 * workers count — those are the three ways this app loads a module. Entry points
 * (`src/main.tsx`), tests and files outside `src/` are never reported.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXACT = /\.(?:ts|tsx)$/;

/** Every module specifier a source file references. */
export function moduleSpecifiers(text) {
  const found = new Set();
  for (const match of text.matchAll(
    /(?:from|import)\s*\(?\s*["']([^"'.][^"']*|\.{1,2}\/[^"']*)["']/g,
  )) {
    found.add(match[1]);
  }
  for (const match of text.matchAll(
    /new URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g,
  )) {
    found.add(match[1]);
  }
  return [...found];
}

/** The file a relative specifier points at, or null for a package import. */
export function resolveCandidates(fromFile, specifier) {
  if (!specifier.startsWith(".")) return [];
  const bare = resolve(dirname(fromFile), specifier).replace(/\.js$/, "");
  const bases = EXACT.test(bare) ? [bare] : [bare, join(bare, "index")];
  const candidates = [];
  for (const base of bases) {
    for (const ext of [".ts", ".tsx"]) {
      if (existsSync(base.endsWith(ext) ? base : base + ext)) {
        candidates.push(base.endsWith(ext) ? base : base + ext);
      }
    }
  }
  return candidates;
}

/** Files that are wired up by the bundler, not by an import statement. */
export function isEntry(file) {
  const path = file.replace(/\\/g, "/");
  return (
    /\/src\/main\.tsx$/.test(path) ||
    /\.test\.(?:ts|tsx)$/.test(path) ||
    !/\/src\//.test(path)
  );
}

/** Modules in `files` that no other file in `files` references. */
export function unreferencedModules(files, read = readFileSync) {
  const referenced = new Set();
  for (const file of files) {
    for (const specifier of moduleSpecifiers(read(file, "utf8"))) {
      for (const target of resolveCandidates(file, specifier)) {
        referenced.add(resolve(target));
      }
    }
  }
  return files.filter(
    (file) => !isEntry(file) && !referenced.has(resolve(file)),
  );
}

/** Every tracked source file under a directory. */
export function trackedSources(directory, run = execFileSync) {
  const output = run("git", ["ls-files", "-z", "--", directory], {
    encoding: "utf8",
  });
  return output
    .split("\0")
    .filter((entry) => entry.length > 0)
    .filter((entry) => /\.(?:ts|tsx)$/.test(entry));
}

function main(argv) {
  const check = argv.includes("--check");
  const root = process.cwd();
  const directory = "apps/web/src";
  const files = trackedSources(directory).map((file) => join(root, file));
  const dead = unreferencedModules(files);
  if (dead.length === 0) {
    console.log(`No unreferenced modules in ${directory}.`);
    return 0;
  }
  console.log(`${dead.length} module(s) nothing imports:`);
  for (const file of dead) console.log(`  ${relative(root, file)}`);
  return check ? 1 : 0;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main(process.argv.slice(2));
}

export { statSync };
