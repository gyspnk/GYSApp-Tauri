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
 * Hosted CI stays the source of truth; this is the ~10 s loop for one contract.
 */
import { execFileSync } from "node:child_process";
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

export function buildCommand(env) {
  return {
    command: "pnpm",
    args: ["--filter", "@gys/web", "build"],
    env: { ...env, GYS_ALLOW_LOCAL_HEAVY: "1" },
  };
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0)
    throw new Error("usage: pnpm e2e:one <spec…> [-g <title>]");

  const build = buildCommand(process.env);
  execFileSync(build.command, build.args, {
    cwd: root,
    stdio: "inherit",
    env: build.env,
  });
  execFileSync("pnpm", playwrightArgs(argv), {
    cwd: join(root, "apps", "web"),
    stdio: "inherit",
    env: { ...process.env, GYS_E2E_PREBUILT: "1" },
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
