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
 *   pnpm verify --explain <runId>   replay why a past run failed
 *
https://github.com/features/actions
 */
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyChanges,
  discoverErrorContexts,
  formatFailure,
  summarizeFailure,
} from "./test-loop-core.mjs";
import { collectPushFiles } from "./changed-files.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const wait = args.includes("--wait");
const qa = args.includes("--qa");
// `--explain <runId>` replays a past failure without changing anything.
const explainAt = args.indexOf("--explain");

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
  const since = Date.now();
  const run = gh("workflow", "run", "ci.yml", "--ref", reference, ...extra);
  if (run.code !== 0) {
    console.error(`gh workflow run failed: ${run.err || run.out}`);
    process.exit(1);
  }
  console.log(
    `▶ requested ci.yml on ${reference}${extra.length ? ` (${extra.join(" ")})` : ""}`,
  );
  const head_sha = git("rev-parse", "HEAD");
  const dispatched = waitForDispatchedRun(head_sha, since);
  if (!dispatched) {
    console.error(
      "No dispatched ci.yml run appeared within 60 s; check `gh run list --workflow ci.yml`.",
    );
    process.exit(1);
  }
  return dispatched.databaseId;
}

function listRuns(sha) {
  const listed = gh(
    "run",
    "list",
    "--workflow",
    "ci.yml",
    "--commit",
    sha,
    "--limit",
    "10",
    "--json",
    "databaseId,status,conclusion,url,headBranch,event,createdAt",
  );
  if (listed.code !== 0) return [];
  try {
    return JSON.parse(listed.out || "[]");
  } catch {
    return [];
  }
}

/** A dispatch never reuses the push run for the same commit. */
export function pickDispatchedRun(runs, since) {
  return (
    runs
      .filter(
        (run) =>
          run.event === "workflow_dispatch" &&
          Date.parse(run.createdAt) >= since - 5_000,
      )
      .sort((a, b) => b.databaseId - a.databaseId)[0] ?? null
  );
}

function waitForDispatchedRun(sha, since) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const match = pickDispatchedRun(listRuns(sha), since);
    if (match) return match;
    spawnSync("node", [
      "-e",
      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,5000)",
    ]);
  }
  return null;
}

function findRun(sha) {
  return listRuns(sha)[0] ?? null;
}

function readVerdict(runId) {
  const view = gh(
    "run",
    "view",
    String(runId),
    "--json",
    "status,conclusion,url",
  );
  try {
    return JSON.parse(view.out || "{}");
  } catch {
    return {};
  }
}

/**
 * Say which hosted job broke and why, so the next step needs no `gh` archeology.
 * `--log-failed` is only readable once the run is complete, which it is here.
 */
function explainFailure(runId) {
  const jobs = gh(
    "api",
    `repos/{owner}/{repo}/actions/runs/${runId}/jobs`,
    "--jq",
    ".jobs",
  );
  if (jobs.code !== 0) {
    console.log("  ! could not read the jobs; open the run URL above");
    return;
  }
  const log = gh("run", "view", String(runId), "--log-failed");
  let rows;
  try {
    rows = summarizeFailure(JSON.parse(jobs.out || "[]"), log.out);
  } catch {
    console.log("  ! could not parse the job list; open the run URL above");
    return;
  }
  for (const line of formatFailure(rows)) console.log(`  ${line}`);
  if (rows.length > 4)
    console.log(`  … ${rows.length - 4} more failing job(s) in the run URL`);
  if (rows.length) downloadFailureArtifacts(runId);
}

/**
 * Pull the failure bundles a red run leaves behind (Playwright writes an
 * `error-context.md` per failing test) so the diagnosis needs no second `gh`
 * call. Artifacts expire, and a run without failures has none, so every step
 * here is allowed to fail quietly.
 */
function downloadFailureArtifacts(runId) {
  const listed = gh(
    "api",
    `repos/{owner}/{repo}/actions/runs/${runId}/artifacts`,
    "--jq",
    '.artifacts[] | select(.name | test("failures")) | .name',
  );
  const names = listed.out
    .split("\n")
    .map((line) => line.trim().replace(/^"|"$/g, ""))
    .filter(Boolean);
  if (listed.code !== 0 || !names.length) return;
  const into = path.join(rootDir, ".verify", String(runId));
  const saved = [];
  for (const name of names) {
    const result = spawnSync(
      "gh",
      ["run", "download", String(runId), "-n", name, "-D", into],
      { cwd: rootDir, encoding: "utf8" },
    );
    if (result.status === 0) saved.push(name);
  }
  if (!saved.length) return;
  const context = discoverErrorContexts(into);
  console.log(
    `  ↓ artifacts in ${path.relative(rootDir, into)} (${saved.length})`,
  );
  for (const file of context.slice(0, 3))
    console.log(`    ${path.relative(rootDir, file)}`);
}

function waitFor(runId) {
  console.log(
    `▶ watching run ${runId} — hosted, nothing heavy runs on this device`,
  );
  spawnSync(
    "gh",
    ["run", "watch", String(runId), "--exit-status", "--interval", "20"],
    { cwd: rootDir, stdio: "inherit" },
  );
  // The watch can end on a flaky GitHub API call (unexpected EOF), so the run's
  // own verdict decides, not the watch exit code.
  let verdict = readVerdict(runId);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (verdict.status === "completed") break;
    spawnSync("node", [
      "-e",
      "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10000)",
    ]);
    verdict = readVerdict(runId);
  }
  const passed = verdict.conclusion === "success";
  console.log(
    `\n${passed ? "✅" : "❌"} run ${runId}: ${verdict.conclusion ?? "verdict unavailable"} — ${verdict.url ?? ""}`,
  );
  if (!passed) explainFailure(runId);
  process.exit(passed ? 0 : 1);
}

if (explainAt !== -1) {
  const runId = args[explainAt + 1];
  if (!runId) {
    console.error("usage: pnpm verify --explain <runId>");
    process.exit(1);
  }
  explainFailure(runId);
  process.exit(0);
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

if (qa) {
  const runId = dispatchAndWatch(branch, ["-f", "qa=true"]);
  waitFor(runId);
}

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
  console.log("  ! latest run for this commit did not succeed");
  explainFailure(run.databaseId);
  process.exit(1);
}
