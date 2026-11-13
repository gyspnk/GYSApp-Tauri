import assert from "node:assert/strict";
import { test } from "node:test";
import { failingJobs, parseRun, verdict, watchRun } from "./watch-run.mjs";

const run = (status, conclusion, updated = "2026-11-13T07:10:00Z") =>
  JSON.stringify({
    status,
    conclusion,
    html_url: "https://example.test/run/7",
    created_at: "2026-11-13T07:05:00Z",
    updated_at: updated,
  });

test("reads a run and its elapsed time", () => {
  const parsed = parseRun(run("completed", "success"));
  assert.equal(parsed.conclusion, "success");
  assert.equal(parsed.url, "https://example.test/run/7");
  assert.equal(parsed.updatedAt - parsed.createdAt, 5 * 60_000);
});

test("lists only jobs that really failed", () => {
  const jobs = JSON.stringify([
    { name: "verify", conclusion: "success" },
    { name: "e2e-shard (3)", conclusion: "failure" },
    { name: "native-check", conclusion: "skipped" },
    { name: "e2e", conclusion: "cancelled" },
  ]);
  assert.deepEqual(failingJobs(jobs), ["e2e-shard (3)", "e2e"]);
  assert.deepEqual(failingJobs("not json"), []);
});

test("prints one block with the failing jobs and the next command", () => {
  const outcome = verdict(
    { ...parseRun(run("completed", "failure")), id: "7" },
    JSON.stringify([{ name: "e2e-shard (3)", conclusion: "failure" }]),
  );
  assert.equal(outcome.ok, false);
  assert.equal(
    outcome.lines[0],
    "run 7 failure (5m 0s) — https://example.test/run/7",
  );
  assert.deepEqual(outcome.lines.slice(1), [
    "✗ e2e-shard (3)",
    "  next: pnpm verify --explain 7",
  ]);
});

test("keeps polling until the run completes", async () => {
  const replies = [
    run("in_progress", null),
    run("in_progress", null),
    run("completed", "success"),
    JSON.stringify([{ name: "verify", conclusion: "success" }]),
  ];
  const printed = [];
  const status = await watchRun({
    runId: "7",
    read: () => ({ code: 0, out: replies.shift() ?? "{}" }),
    sleep: async () => {},
    now: () => 0,
    timeoutMs: 60_000,
    print: (line) => printed.push(line),
  });
  assert.equal(status, 0);
  assert.equal(printed.length, 1);
  assert.match(printed[0], /^run 7 success/);
});

test("gives up instead of hanging when the budget runs out", async () => {
  let clock = 0;
  const printed = [];
  const status = await watchRun({
    runId: "7",
    read: () => ({ code: 0, out: run("in_progress", null) }),
    sleep: async () => {
      clock += 30_000;
    },
    now: () => clock,
    timeoutMs: 60_000,
    print: (line) => printed.push(line),
  });
  assert.equal(status, 2);
  assert.match(printed[0], /still in_progress/);
});

test("reports a failed run as a failure, not a crash", async () => {
  const replies = [run("completed", "failure"), JSON.stringify([])];
  const status = await watchRun({
    runId: "7",
    read: () => ({ code: 0, out: replies.shift() ?? "{}" }),
    sleep: async () => {},
    now: () => 0,
    print: () => {},
  });
  assert.equal(status, 1);
});
