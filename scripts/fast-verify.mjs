#!/usr/bin/env node
/**
 * High-speed unified local verification runner for the 8-core / 11 GiB host.
 *
 * Phase 1 (Parallel): Runs `check:fast`, `dead-css.mjs`, and `dead-modules.mjs`
 * concurrently.
 * Phase 2 (Incremental): Rebuilds `@gys/web` only when source inputs are newer
 * than `dist/index.html` (or `--force-build` is passed).
 * Phase 3 (Single Preview Server): Spawns one `vite preview` server on :4173,
 * runs the 3 Playwright layout/consistency audits concurrently with bounded
 * worker concurrency, and optionally runs selective or explicit E2E specs
 * against that same preview instance.
 *
 * Usage:
 *   pnpm verify:local
 *   pnpm verify:local -- --e2e e2e/home-hero.spec.ts
 *   pnpm verify:local -- --changed
 */
import { spawn } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCommand, isFresh, newestSource } from "./e2e-one.mjs";
import { pnpmInvocation } from "./process-result.mjs";
import {
  collectChangedFiles,
  resolveSelectiveTestArgs,
} from "./test-e2e-selective-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");
const args = process.argv.slice(2).filter((arg) => arg !== "--");

const forceBuild = args.includes("--force-build");
const skipAudits = args.includes("--skip-audits");
const runChangedE2e = args.includes("--changed");
const e2eIndex = args.indexOf("--e2e");
const e2eSpecs =
  e2eIndex >= 0
    ? args.slice(e2eIndex + 1).filter((arg) => !arg.startsWith("--"))
    : [];

function runAsync(label, command, cmdArgs, options = {}) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const child = spawn(command, cmdArgs, {
      cwd: options.cwd ?? rootDir,
      env: { ...process.env, GYS_ALLOW_LOCAL_HEAVY: "1", ...options.env },
      shell: options.shell ?? false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const output = [];
    child.stdout.on("data", (chunk) => output.push(chunk));
    child.stderr.on("data", (chunk) => output.push(chunk));
    child.on("close", (code) => {
      resolve({
        label,
        code: code ?? 1,
        ms: Date.now() - startedAt,
        output: Buffer.concat(output).toString("utf8"),
      });
    });
  });
}

async function isPreviewReachable(url) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
    return response.ok;
  } catch {
    return false;
  }
}

const totalStart = Date.now();
const phaseStart = Date.now();

// Phase 1: Parallel static & dead-code checks
const [fastCheckRes, deadCssRes, deadModulesRes] = await Promise.all([
  runAsync("check:fast", process.execPath, ["scripts/fast-check.mjs"]),
  runAsync("dead-css", process.execPath, ["scripts/dead-css.mjs"]),
  runAsync("dead-modules", process.execPath, ["scripts/dead-modules.mjs"]),
]);

const phase1Results = [fastCheckRes, deadCssRes, deadModulesRes];
const phase1Failed = phase1Results.filter((r) => r.code !== 0);
for (const res of phase1Results) {
  console.log(
    `[phase 1] ${res.label}: ${res.code === 0 ? "ok" : "FAILED"} (${res.ms} ms)`,
  );
  if (res.code !== 0) process.stdout.write(res.output);
}
if (phase1Failed.length > 0) process.exit(1);

// Phase 2: Incremental @gys/web build
const buildStart = Date.now();
const distIndex = path.join(webDir, "dist", "index.html");
let fresh = false;
try {
  fresh =
    !forceBuild && isFresh(statSync(distIndex).mtimeMs, newestSource(webDir));
} catch {
  fresh = false;
}
if (fresh) {
  console.log(`[phase 2] build: skipped (dist is fresh)`);
} else {
  const build = buildCommand(process.env);
  const buildRes = await runAsync("build", build.command, build.args, {
    env: { ...build.env, GYS_FAST_BUILD: "1" },
  });
  if (buildRes.code !== 0) {
    process.stdout.write(buildRes.output);
    process.exit(buildRes.code);
  }
  console.log(`[phase 2] build: ok (${Date.now() - buildStart} ms)`);
}

// Phase 3: Shared preview server -> parallel UI audits + optional E2E
const appUrl = "http://127.0.0.1:4173/GYSApp-Tauri/";
let previewChild;
if (!(await isPreviewReachable(appUrl))) {
  const preview = pnpmInvocation([
    "--filter",
    "@gys/web",
    "preview",
    "--host",
    "127.0.0.1",
    "--port",
    "4173",
    "--strictPort",
  ]);
  previewChild = spawn(preview.command, preview.args, {
    cwd: rootDir,
    shell: preview.shell,
    stdio: "ignore",
  });
  for (let i = 0; i < 40; i += 1) {
    if (await isPreviewReachable(appUrl)) break;
    await new Promise((r) => setTimeout(r, 200));
  }
}

try {
  if (!skipAudits) {
    const auditStart = Date.now();
    const auditEnv = { UI_AUDIT_CONCURRENCY: "2" };
    const audits = await Promise.all([
      runAsync(
        "ui:boxes",
        process.execPath,
        ["apps/web/scripts/ui-box-audit.mjs"],
        { env: auditEnv },
      ),
      runAsync(
        "ui:consistency",
        process.execPath,
        ["apps/web/scripts/ui-consistency-audit.mjs"],
        { env: auditEnv },
      ),
      runAsync(
        "ui:overflow",
        process.execPath,
        ["apps/web/scripts/ui-overflow-audit.mjs"],
        { env: auditEnv },
      ),
    ]);
    for (const res of audits) {
      console.log(
        `[phase 3] ${res.label}: ${res.code === 0 ? "ok" : "FAILED"} (${res.ms} ms)`,
      );
      if (res.code !== 0) process.stdout.write(res.output);
    }
    if (audits.some((r) => r.code !== 0)) process.exit(1);
    console.log(`[phase 3] audits total: ${Date.now() - auditStart} ms`);
  }

  let selectedArgs = e2eSpecs;
  if (runChangedE2e) {
    const changed = collectChangedFiles({ rootDir });
    const plan = resolveSelectiveTestArgs(changed, []);
    selectedArgs = plan.args;
  }
  if (selectedArgs.length > 0) {
    const e2eStart = Date.now();
    const pw = pnpmInvocation([
      "exec",
      "playwright",
      "test",
      "--config=playwright.local.config.ts",
      ...selectedArgs,
    ]);
    const e2eRes = await runAsync("e2e", pw.command, pw.args, {
      cwd: webDir,
      shell: pw.shell,
      env: { GYS_E2E_PREBUILT: "1" },
    });
    process.stdout.write(e2eRes.output);
    console.log(
      `[phase 3] e2e: ${e2eRes.code === 0 ? "ok" : "FAILED"} (${Date.now() - e2eStart} ms)`,
    );
    if (e2eRes.code !== 0) process.exit(e2eRes.code);
  }
} finally {
  if (previewChild) previewChild.kill("SIGTERM");
}

console.log(
  `\nverify:local complete in ${((Date.now() - totalStart) / 1000).toFixed(2)}s (phase1+setup ${phase1Results.reduce((a, b) => Math.max(a, b.ms), 0)}ms vs ${Date.now() - phaseStart}ms total)`,
);
