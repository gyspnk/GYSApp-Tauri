#!/usr/bin/env node
/**
 * Fast local feedback for a small change.
 *
 * Owner policy (10 Nov, creator mode): local runs are allowed when they are
 * faster than waiting for a hosted run, as long as the device is not
 * overloaded. This script is the cheap end of that range — Prettier on the
 * files you touched, the web typecheck, and only the unit files that cover
 * them. Everything heavier (full unit suite, browser contracts, visual, perf,
 * build) still belongs to GitHub Actions.
 *
 *   pnpm check:fast              # worktree changes against origin/main
 *   pnpm check:fast -- src/a.ts  # explicit paths
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const FORMATTED = /\.(?:[cm]?[jt]sx?|json|css|scss|html|md|ya?ml)$/;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

export function collectChecks(files) {
  const changed = [...new Set(files)].filter(
    (file) => file && existsSync(file),
  );
  const formatted = changed.filter((file) => FORMATTED.test(file));
  const sources = changed.filter(
    (file) => SOURCE.test(file) && !/\.test\.[cm]?[jt]sx?$/.test(file),
  );
  const tests = changed.filter((file) => /\.test\.[cm]?[jt]sx?$/.test(file));
  for (const source of sources) {
    const stub = source.replace(SOURCE, ".test.ts");
    const sibling = join(dirname(source), `${baseName(source)}.test.ts`);
    for (const candidate of [stub, sibling]) {
      if (candidate !== source && existsSync(candidate)) tests.push(candidate);
    }
  }
  return { formatted, sources, tests: [...new Set(tests)] };
}

function baseName(file) {
  return file.slice(file.lastIndexOf("/") + 1).replace(SOURCE, "");
}

function changedSince(since) {
  try {
    const out = execFileSync(
      "git",
      ["diff", "--name-only", "--diff-filter=ACMR", since],
      { encoding: "utf8" },
    );
    return out.split("\n").filter(Boolean);
  } catch {
    return [];
  }
}

function run(label, command, args) {
  const started = Date.now();
  process.stdout.write(`\n▸ ${label}\n`);
  try {
    execFileSync(command, args, { stdio: "inherit" });
    process.stdout.write(`  ok (${Date.now() - started} ms)\n`);
  } catch {
    process.stdout.write(`  failed (${Date.now() - started} ms)\n`);
    process.exitCode = 1;
  }
}

export function main(argv = process.argv.slice(2)) {
  const files = argv.length ? argv : changedSince("origin/main");
  const { formatted, sources, tests } = collectChecks(files);
  if (!formatted.length && !sources.length && !tests.length) {
    process.stdout.write("Nothing changed against origin/main.\n");
    return;
  }
  if (formatted.length)
    run("format", "pnpm", ["exec", "prettier", "--check", ...formatted]);
  if (sources.length)
    run("typecheck (web)", "pnpm", [
      "--filter",
      "@gys/web",
      "exec",
      "tsc",
      "--noEmit",
    ]);
  if (tests.length)
    run("unit (touched)", "pnpm", [
      "--filter",
      "@gys/web",
      "exec",
      "vitest",
      "run",
      ...tests,
    ]);
  process.stdout.write(
    process.exitCode ? "\nLocal check failed.\n" : "\nLocal check clean.\n",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
