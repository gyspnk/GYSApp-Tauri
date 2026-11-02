#!/usr/bin/env node
// Summarise how long recent GitHub Actions runs really took.
//
// The owner moved browser/test/visual workload to GitHub Actions (2 Nov) and
// asked for the CI itself to keep getting faster. Tuning by guesswork wastes
// minutes, so this script prints the measured facts per run: queue time, wall
// time, each job's duration and the slowest step. Use it before and after a
// cache/shard/filter change to prove the improvement instead of asserting it.
//
// Usage:
//   node scripts/ci-timings.mjs [--limit 8] [--workflow ci.yml] [--json]
//
// Requires the GitHub CLI (`gh auth status` must pass). Read-only: it only
// calls the Actions REST API through `gh api`.

import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
function take(flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

const limit = Number(take("--limit", "8"));
const workflow = take("--workflow", "");
const asJson = args.includes("--json");

function gh(endpoint) {
  try {
    return JSON.parse(
      execFileSync(
        "gh",
        ["api", "-H", "Accept: application/vnd.github+json", endpoint],
        {
          encoding: "utf8",
          maxBuffer: 64 * 1024 * 1024,
        },
      ),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`gh api ${endpoint} failed: ${detail}`);
    process.exit(1);
  }
}

const repo = gh("repos/{owner}/{repo}").full_name;
const query = workflow
  ? `repos/${repo}/actions/workflows/${encodeURIComponent(workflow)}/runs?per_page=${limit}`
  : `repos/${repo}/actions/runs?per_page=${limit}`;
const runs = gh(query).workflow_runs ?? [];

const minutes = (ms) => Math.round((ms / 60000) * 10) / 10;

const report = runs.map((run) => {
  const jobs =
    gh(`repos/${repo}/actions/runs/${run.id}/jobs?per_page=100`).jobs ?? [];
  const summary = jobs.map((job) => {
    const started = job.started_at ? Date.parse(job.started_at) : null;
    const finished = job.completed_at ? Date.parse(job.completed_at) : null;
    const steps = (job.steps ?? [])
      .filter((step) => step.started_at && step.completed_at)
      .map((step) => ({
        name: step.name,
        minutes: minutes(
          Date.parse(step.completed_at) - Date.parse(step.started_at),
        ),
      }))
      .sort((left, right) => right.minutes - left.minutes);
    return {
      name: job.name,
      conclusion: job.conclusion,
      minutes: started && finished ? minutes(finished - started) : null,
      slowest: steps.slice(0, 2),
    };
  });
  const started = Date.parse(run.run_started_at ?? run.created_at);
  const finished = run.updated_at ? Date.parse(run.updated_at) : null;
  return {
    id: run.id,
    event: run.event,
    branch: run.head_branch,
    title: (run.display_title ?? "").slice(0, 60),
    conclusion: run.conclusion,
    queueMinutes:
      run.run_started_at && run.created_at
        ? minutes(Date.parse(run.run_started_at) - Date.parse(run.created_at))
        : null,
    wallMinutes: finished ? minutes(finished - started) : null,
    jobMinutes: summary.reduce((total, job) => total + (job.minutes ?? 0), 0),
    jobs: summary.sort(
      (left, right) => (right.minutes ?? 0) - (left.minutes ?? 0),
    ),
  };
});

if (asJson) {
  console.log(JSON.stringify({ repo, runs: report }, null, 2));
} else {
  console.log(`Repository: ${repo}`);
  for (const run of report) {
    console.log(
      `\nrun ${run.id} · ${run.event} · ${run.branch} · ${run.conclusion ?? "running"} · ` +
        `queue ${run.queueMinutes ?? "?"} m · wall ${run.wallMinutes ?? "?"} m · ` +
        `job sum ${Math.round(run.jobMinutes * 10) / 10} m`,
    );
    console.log(`  ${run.title}`);
    for (const job of run.jobs) {
      const slowest = job.slowest
        .map((step) => `${step.name} ${step.minutes} m`)
        .join("; ");
      console.log(
        `  - ${job.name}: ${job.minutes ?? "?"} m (${job.conclusion ?? "?"})` +
          (slowest ? ` — slowest: ${slowest}` : ""),
      );
    }
  }
}
