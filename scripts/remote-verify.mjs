#!/usr/bin/env node
/**
 * Hosted verification for the current HEAD.
 *
 * Owner policy (7 Nov): every process runs in GitHub Actions; this device only
 * serves the site. So the inner loop no longer executes typecheck, unit tests
 * or Playwright locally — it explains what the hosted run will cover and, when
 * asked, waits for that run.
 *
 *   pnpm verify            map the pending changes, show the run for HEAD
 *   pnpm verify --wait     same, then wait for it and exit with its verdict
 *   pnpm verify:qa         request the screenshot + audit matrix and wait
 *
https://github.com/features/actions
 */
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyChanges } from "./test-loop-core.mjs";
import { collectPushFiles } from "./changed-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const wait = args.includes("--wait");
const qa = args.includes("--qa");

const sleepSync = (ms) =>
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function git(...gitArgs) {
  return execFileSync("git", gitArgs, {
    cwd: rootDir,
    encoding: "utf8",
  }).trim();
}

function gh(...ghArgs) {
  const result = spawnSync("gh", ghArgs, { cwd: rootDir, encoding: "utf8" });
  if (result.error) {
    return { code: 127, out: "", err: "the gh CLI is not available" };
  }
  return {
    code: result.status ?? 1,
    out: result.stdout.trim(),
    err: result.stderr.trim(),
  };
}

function hostedPlan(files) {
  if (!files.length)
    return ["no pending changes; the last pushed tree is already verified"];
  const c = classifyChanges(files);
  const plan = [];
  if (c.hasWebSource)
    plan.push(
      "typecheck + unit + selective Playwright contracts for the touched features",
    );
  if (c.hasE2E) plan.push("the touched spec files");
  if (c.hasPackageSource || c.hasScripts)
    plan.push("workspace unit tests + policy/script tests + typecheck");
  if (c.hasBuildConfig) plan.push("build + bundle budget");
  if (c.hasOther) plan.push("core Playwright fallback (108 tests)");
  if (!plan.length)
    plan.push("docs path: documentation gate + Prettier (~45 s hosted)");
  return plan;
}

function dispatchAndWatch(reference, extra = []) {
  const run = gh("workflow", "run", "ci.yml", "--ref", reference, ...extra);
  if (run.code !== 0) {
    console.error(`gh workflow run failed: ${run.err || run.out}`);
    process.exit(1);
  }
  console.log(
    `▶ requested ci.yml on ${reference}${extra.length ? ` (${extra.join(" ")})` : ""}`,
  );
}

function findRun(sha) {
  const listed = gh(
    "run",
    "list",
    "--workflow",
    "ci.yml",
    "--commit",
    sha,
    "--limit",
    "5",
    "--json",
    "databaseId,status,conclusion,url,headBranch,event",
  );
  if (listed.code !== 0) return null;
  try {
    return JSON.parse(listed.out || "[]")[0] ?? null;
  } catch {
    return null;
  }
}

function waitFor(runId) {
  console.log(
    `▶ watching run ${runId} — hosted, nothing heavy runs on this device`,
  );
  const watched = spawnSync(
    "gh",
    ["run", "watch", String(runId), "--exit-status", "--interval", "20"],
    {
      cwd: rootDir,
      stdio: "inherit",
    },
  );
  const view = gh(
    "run",
    "view",
    String(runId),
    "--json",
    "conclusion,url,displayTitle",
  );
  let summary = "";
  try {
    const parsed = JSON.parse(view.out || "{}");
    summary = `${parsed.conclusion ?? "unknown"} — ${parsed.url ?? ""}`;
  } catch {
    summary = "verdict unavailable";
  }
  console.log(
    `\n${watched.status === 0 ? "✅" : "❌"} run ${runId}: ${summary}`,
  );
  process.exit(watched.status === 0 ? 0 : 1);
}

const changed = collectPushFiles({ rootDir });

const branch = git("rev-parse", "--abbrev-ref", "HEAD");
const sha = git("rev-parse", "HEAD");
const dirty = git("status", "--porcelain").length > 0;

console.log(`\nHosted verification plan for ${sha.slice(0, 10)} on ${branch}`);
for (const line of hostedPlan(changed)) console.log(`  • ${line}`);
if (dirty)
  console.log(
    "  ! working tree is dirty: commit and push first, Actions only sees pushed commits",
  );

if (qa) dispatchAndWatch(branch, ["-f", "qa=true"]);

let run = findRun(sha);
if (!run) {
  const ahead = spawnSync(
    "git",
    ["rev-list", "--count", `origin/${branch}..HEAD`],
    {
      cwd: rootDir,
      encoding: "utf8",
    },
  ).stdout?.trim();
  if (ahead && ahead !== "0") {
    console.log(
      `  ! ${ahead} commit(s) not pushed yet — push to trigger the hosted run`,
    );
    process.exit(wait ? 1 : 0);
  }
  console.log(
    "  • no run yet for this commit; waiting for it to appear (hosted queue)",
  );
  for (let attempt = 0; attempt < 12 && !run; attempt += 1) {
    sleepSync(5_000);
    run = findRun(sha);
  }
}

if (!run) {
  console.log(
    "  ! no ci.yml run found for this commit; dispatch one with: gh workflow run ci.yml",
  );
  process.exit(0);
}

console.log(
  `\nrun ${run.databaseId} (${run.event}): ${run.status}${run.conclusion ? ` / ${run.conclusion}` : ""}`,
);
console.log(`  ${run.url}`);

if (wait && run.status !== "completed") waitFor(run.databaseId);
if (run.conclusion && run.conclusion !== "success") {
  console.log(
    "  ! latest run for this commit did not succeed; inspect the failing jobs above",
  );
  process.exit(1);
}
