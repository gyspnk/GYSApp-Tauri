#!/usr/bin/env node
/**
 * Run one browser contract against the local preview, with a fresh bundle.
 *
 * `pnpm preview` (4173) serves `dist`, so a local spec run silently tests the
 * previous build after any `src` change — that cost a whole debugging round
 * ("the dialog never appears"). This script rebuilds the web bundle first, then
 * hands the spec arguments to Playwright.
 *
 *   pnpm e2e:one e2e/kidung-confirm-delete.spec.ts
 *   pnpm e2e:one e2e/ui-polish.spec.ts -g "missing daily artwork"
 *
 * `pnpm e2e:one --changed` asks the same selector CI uses which contracts a
 * diff can affect, so a local run covers the same files as the hosted job.
 *
 * The rebuild is skipped when `dist` is already newer than every source file,
 * which keeps a second run of the same contract at ~3 s instead of ~6 s. Pass
 * GYS_E2E_FORCE_BUILD=1 to rebuild anyway.
 *
 * Hosted CI stays the source of truth; this is the ~10 s loop for one contract.
 */
import { execFileSync } from "node:child_process";
import { resolveSelectiveTestArgs } from "./test-e2e-selective-core.mjs";
import { readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function playwrightArgs(argv) {
  // Order matters: `-g "title"` carries its own argument, so splat the caller's
  // arguments through unchanged and only pin the project and reporter.
  return [
    "exec",
    "playwright",
    "test",
    ...argv,
    "--project=chromium",
    "--reporter=line",
  ];
}

/** `dist` may skip the rebuild only when it is not older than any source. */
export function isFresh(distMtimeMs, newestSourceMs) {
  return Number.isFinite(distMtimeMs) && distMtimeMs >= newestSourceMs;
}

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "test-results",
  "playwright-report",
  ".turbo",
]);

/** Newest modification time under `dir`, ignoring build output and caches. */
export function newestSource(dir, read = readdirSync, stat = statSync) {
  let newest = 0;
  for (const entry of read(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    const path = join(dir, entry.name);
    const time = entry.isDirectory()
      ? newestSource(path, read, stat)
      : stat(path).mtimeMs;
    if (time > newest) newest = time;
  }
  return newest;
}

/** Files this checkout would change: committed on the branch plus uncommitted. */
export function changedFiles(
  run = (args) => execFileSync("git", args, { encoding: "utf8" }),
) {
  const read = (args, cut = 0) =>
    run(args)
      .split("\n")
      // Porcelain prefixes the line (" M a.ts", "?? b.ts"); trim only after the
      // prefix is gone, or the first character of the path is eaten.
      .map((line) => line.slice(cut).trim())
      .filter(Boolean);
  return [
    ...new Set([
      ...read(["diff", "--name-only", "origin/main...HEAD"]),
      ...read(["status", "--porcelain"], 3),
    ]),
  ];
}

export function buildCommand(env) {
  return {
    command: "pnpm",
    args: ["--filter", "@gys/web", "build"],
    env: { ...env, GYS_ALLOW_LOCAL_HEAVY: "1" },
  };
}

function main() {
  let argv = process.argv.slice(2);
  if (argv[0] === "--changed") {
    const rest = argv.slice(1);
    const { args, description } = resolveSelectiveTestArgs(
      changedFiles(),
      rest,
    );
    console.log(`e2e:one: ${description}`);
    if (!args.some((arg) => /^e2e\/.*\.spec\.ts$/.test(arg))) {
      console.log("e2e:one: the current diff maps to no browser contract");
      return;
    }
    argv = args;
  }
  if (argv.length === 0)
    throw new Error("usage: pnpm e2e:one <spec…> | --changed, [-g <title>]");

  const web = join(root, "apps", "web");
  const distIndex = join(web, "dist", "index.html");
  let fresh = false;
  try {
    fresh =
      process.env.GYS_E2E_FORCE_BUILD !== "1" &&
      isFresh(statSync(distIndex).mtimeMs, newestSource(web));
  } catch {
    fresh = false;
  }
  if (fresh) {
    console.log("e2e:one: dist is newer than src, skipping the rebuild");
  } else {
    const build = buildCommand(process.env);
    execFileSync(build.command, build.args, {
      cwd: root,
      stdio: "inherit",
      env: build.env,
    });
  }
  execFileSync("pnpm", playwrightArgs(argv), {
    cwd: web,
    stdio: "inherit",
    env: { ...process.env, GYS_E2E_PREBUILT: "1" },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
