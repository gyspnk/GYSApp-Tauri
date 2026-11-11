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
import { dirname, join, relative } from "node:path";
import { pathToFileURL } from "node:url";

const FORMATTED = /\.(?:[cm]?[jt]sx?|json|css|scss|html|md|ya?ml)$/;
const SOURCE = /\.(?:[cm]?[jt]sx?)$/;

/** Which workspace package owns a path, so the check runs in the right one. */
export function ownerOf(file) {
  if (file.startsWith("apps/bff/")) return "@gys/bff";
  if (file.startsWith("apps/web/")) return "@gys/web";
  const workspace = /^packages\/([^/]+)\//.exec(file);
  return workspace ? `@gys/${workspace[1]}` : undefined;
}

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
  // A scripts/*.mjs tool owns a sibling .test.mjs; without this the local check
  // stayed green on a broken CLI until CI ran test:scripts.
  for (const source of sources) {
    if (!source.startsWith("scripts/") || !source.endsWith(".mjs")) continue;
    const spec = source.replace(/\.mjs$/, ".test.mjs");
    if (spec !== source && existsSync(spec)) tests.push(spec);
  }
  // Four policy suites read every stylesheet rather than one module, so a plain
  // CSS edit has no sibling test to find. Run them whenever web CSS moves,
  // otherwise an off-scale radius only surfaces in CI (round 24 did exactly
  // that with a 20px panel corner).
  if (
    changed.some(
      (file) => file.startsWith("apps/web/src/") && file.endsWith(".css"),
    )
  ) {
    for (const policy of [
      "apps/web/src/radius-scale.test.ts",
      "apps/web/src/spacing-scale.test.ts",
      "apps/web/src/css-tokens.test.ts",
      "apps/web/src/editorial-palette.test.ts",
    ]) {
      if (existsSync(policy)) tests.push(policy);
    }
  }
  // The three locale files must stay in sync, and only i18n.test.ts says so.
  // Changing i18n-en.ts alone has no sibling test, so the key-set mismatch used
  // to wait for CI twice (rounds 4x). Pull the contract in with the locale.
  if (
    changed.some(
      (file) => file.startsWith("apps/web/src/i18n") && file.endsWith(".ts"),
    )
  ) {
    const contract = "apps/web/src/i18n.test.ts";
    if (existsSync(contract)) tests.push(contract);
  }
  const typechecks = [...new Set([...sources, ...tests].map(ownerOf))].filter(
    Boolean,
  );
  return { formatted, sources, tests: [...new Set(tests)], typechecks };
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
    // A brand-new file is not in that diff yet, and skipping it would mean the
    // check stays green on code that has never been compiled.
    const untracked = execFileSync(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      { encoding: "utf8" },
    );
    return [...out.split("\n"), ...untracked.split("\n")].filter(Boolean);
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
  const { formatted, sources, tests, typechecks } = collectChecks(files);
  if (!formatted.length && !sources.length && !tests.length) {
    process.stdout.write("Nothing changed against origin/main.\n");
    return;
  }
  if (formatted.length)
    run("format", "pnpm", ["exec", "prettier", "--check", ...formatted]);
  for (const workspace of typechecks)
    run(`typecheck (${workspace})`, "pnpm", [
      "--filter",
      workspace,
      "exec",
      "tsc",
      "--noEmit",
    ]);
  const unowned = tests.filter((file) => !ownerOf(file));
  const byOwner = new Map();
  for (const file of tests) {
    const workspace = ownerOf(file);
    if (workspace)
      byOwner.set(workspace, [...(byOwner.get(workspace) ?? []), file]);
  }
  if (unowned.length) run("unit (scripts)", "node", ["--test", ...unowned]);
  for (const [workspace, files] of byOwner)
    // vitest runs inside the package, so hand it package-relative paths.
    run(`unit (${workspace})`, "pnpm", [
      "--filter",
      workspace,
      "exec",
      "vitest",
      "run",
      ...files.map((file) =>
        relative(files[0].split("/").slice(0, 2).join("/"), file),
      ),
    ]);
  process.stdout.write(
    process.exitCode ? "\nLocal check failed.\n" : "\nLocal check clean.\n",
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
