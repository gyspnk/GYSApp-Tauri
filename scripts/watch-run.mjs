#!/usr/bin/env node
/**
 * Watch one hosted run until it finishes and print a compact verdict.
 *
 * `gh run watch` ends on a flaky API call ("unexpected EOF"), so every round
 * used to burn several tool calls polling `gh api .../runs/<id>` by hand.
 * This prints nothing while the run is going, then one block:
 *
 *   run 43383761228 success (4m 12s) — https://…
 *   ✗ e2e-shard (3) — Run full browser shard 3/4
 *     next: pnpm verify --explain 43383761228
 *
 * Exit codes: 0 success, 1 failure, 2 still running when the budget ran out.
 */
import { spawnSync } from "node:child_process";

export function parseRun(json) {
  const run = typeof json === "string" ? JSON.parse(json) : json;
  return {
    status: String(run?.status ?? ""),
    conclusion: run?.conclusion ? String(run.conclusion) : null,
    url: String(run?.html_url ?? ""),
    createdAt: run?.created_at ? Date.parse(run.created_at) : Number.NaN,
    updatedAt: run?.updated_at ? Date.parse(run.updated_at) : Number.NaN,
  };
}

export function failingJobs(json) {
  let jobs;
  try {
    jobs = typeof json === "string" ? JSON.parse(json) : json;
  } catch {
    return [];
  }
  if (!Array.isArray(jobs)) return [];
  return jobs
    .filter(
      (job) =>
        job &&
        job.conclusion &&
        job.conclusion !== "success" &&
        job.conclusion !== "skipped",
    )
    .map((job) => String(job.name ?? "?"));
}

export function verdict(run, jobs) {
  const lines = [];
  const seconds =
    Number.isFinite(run.createdAt) && Number.isFinite(run.updatedAt)
      ? Math.max(0, Math.round((run.updatedAt - run.createdAt) / 1000))
      : null;
  const elapsed =
    seconds === null ? "" : ` (${Math.floor(seconds / 60)}m ${seconds % 60}s)`;
  lines.push(
    `run ${run.id ?? ""} ${run.conclusion ?? run.status}${elapsed} — ${run.url}`,
  );
  const failed = failingJobs(jobs);
  for (const job of failed) lines.push(`✗ ${job}`);
  if (failed.length)
    lines.push(`  next: pnpm verify --explain ${run.id ?? ""}`);
  return { ok: run.conclusion === "success", lines, failed };
}

const DEFAULT_INTERVAL_MS = 20_000;
const DEFAULT_TIMEOUT_MS = 45 * 60_000;

function gh(args) {
  const result = spawnSync("gh", args, { encoding: "utf8" });
  if (result.error) return { code: 127, out: "" };
  return { code: result.status ?? 1, out: String(result.stdout ?? "").trim() };
}

export async function watchRun({
  runId,
  intervalMs = DEFAULT_INTERVAL_MS,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  read = (suffix) =>
    gh(["api", `repos/{owner}/{repo}/actions/runs/${runId}${suffix}`]),
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = () => Date.now(),
  print = (line) => console.log(line),
} = {}) {
  const deadline = now() + timeoutMs;
  for (;;) {
    const runReply = read("");
    if (runReply.code !== 0) {
      print(`could not read run ${runId}; open the run URL in GitHub`);
      return 1;
    }
    const run = { ...parseRun(runReply.out), id: runId };
    if (run.status === "completed") {
      const jobsReply = read("/jobs?per_page=100");
      const jobs = jobsReply.code === 0 ? jobsReply.out : "[]";
      const { ok, lines } = verdict(run, jobs);
      for (const line of lines) print(line);
      return ok ? 0 : 1;
    }
    if (now() >= deadline) {
      print(`run ${runId} still ${run.status || "running"} — ${run.url}`);
      return 2;
    }
    await sleep(intervalMs);
  }
}

/**
 * `args.indexOf(name)` is -1 when the option is absent, and `args[-1 + 1]` is
 * the first argument — which turned a run id into a timeout and overflowed the
 * timer. Read the option only when it is really there.
 */
export function parseArguments(args) {
  const value = (name) => {
    const at = args.indexOf(name);
    return at >= 0 ? Number(args[at + 1]) : Number.NaN;
  };
  const flagged = new Set(["--interval", "--timeout"]);
  const runId =
    args.find(
      (arg, index) => /^\d+$/.test(arg) && !flagged.has(args[index - 1] ?? ""),
    ) ?? "";
  const last = args.includes("--last");
  const interval = value("--interval");
  const timeout = value("--timeout");
  return {
    runId,
    ...(last ? { last: true } : {}),
    ...(Number.isFinite(interval) && interval > 0
      ? { intervalMs: interval * 1000 }
      : {}),
    ...(Number.isFinite(timeout) && timeout > 0
      ? { timeoutMs: timeout * 60_000 }
      : {}),
  };
}

/**
 * The newest run in this repository, so a round need not paste an id after a
 * dispatch. A failed `gh` call is not an exception: the caller reports usage.
 */
export function latestRunId(read = (args) => gh(args)) {
  const reply = read(["run", "list", "--limit", "1", "--json", "databaseId"]);
  if (reply.code !== 0) return "";
  try {
    const runs = JSON.parse(reply.out);
    const id = Array.isArray(runs) ? runs[0]?.databaseId : undefined;
    return id ? String(id) : "";
  } catch {
    return "";
  }
}

const invokedDirectly =
  process.argv[1] && process.argv[1].endsWith("watch-run.mjs");
if (invokedDirectly) {
  const options = parseArguments(process.argv.slice(2));
  const runId = options.runId || (options.last ? latestRunId() : "");
  if (!runId) {
    console.error(
      "usage: pnpm run:watch <runId>|--last [--interval 20] [--timeout 45]",
    );
    process.exit(1);
  }
  process.exit(await watchRun({ ...options, runId }));
}
