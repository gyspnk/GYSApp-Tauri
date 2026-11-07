#!/usr/bin/env node
/**
 * Format check for the files this push actually touches.
 *
 * The pre-push hook must stay cheap: full Prettier, typecheck, unit tests and
 * Playwright all run in GitHub Actions (owner policy, 7 Nov). Checking just the
 * changed files keeps the hook around a second while still catching the one
 * class of mistake a push would otherwise carry into the hosted run.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectPushFiles } from "./changed-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

const PRETTIER_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".css",
  ".md",
  ".yml",
  ".yaml",
  ".html",
]);

const changed = collectPushFiles({ rootDir });

const targets = changed.filter((file) =>
  PRETTIER_EXTENSIONS.has(path.extname(file)),
);

if (!targets.length) {
  console.log("format: no changed files to check");
  process.exit(0);
}

const result = spawnSync("pnpm", ["exec", "prettier", "--check", ...targets], {
  cwd: rootDir,
  stdio: "inherit",
});

if (result.status !== 0) {
  console.error("\nformat: fix with  pnpm exec prettier --write <files>");
  process.exit(1);
}
console.log(`format: ${targets.length} changed file(s) clean`);
