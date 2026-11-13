import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classifyChanges,
  discoverErrorContexts,
  formatFailure,
  summarizeFailure,
} from "./test-loop-core.mjs";

test("documentation-only changes stay out of the test tiers", () => {
  const result = classifyChanges([
    "README.md",
    "CHANGELOG.md",
    "docs/plans/2026-10-30-autonomous-development-handoff.md",
  ]);
  assert.equal(result.code.length, 0);
  assert.equal(result.docs.length, 3);
  assert.equal(result.hasWebSource, false);
  assert.equal(result.hasE2E, false);
});

test("scripts changes select the Node suites, not the browser", () => {
  const result = classifyChanges(["scripts/test-loop.mjs"]);
  assert.equal(result.hasScripts, true);
  assert.equal(result.hasWebSource, false);
  assert.equal(result.hasE2E, false);
  assert.equal(result.hasBuildConfig, false);
  assert.equal(result.hasOther, false);
});

test("a spec change maps to the browser tier only", () => {
  const result = classifyChanges(["apps/web/e2e/smoke.spec.ts"]);
  assert.equal(result.hasE2E, true);
  assert.equal(result.hasWebSource, false);
  assert.equal(result.hasBuildConfig, false);
});

test("a web source change runs typecheck, related units and mapped specs", () => {
  const result = classifyChanges(["apps/web/src/global-search.tsx"]);
  assert.equal(result.hasWebSource, true);
  assert.equal(result.hasPackageSource, false);
  assert.equal(result.hasE2E, false);
});

test("package sources are separated from the web app", () => {
  const result = classifyChanges(["packages/contracts/src/index.ts"]);
  assert.equal(result.hasPackageSource, true);
  assert.equal(result.hasWebSource, false);
});

test("build config asks for build and bundle verification", () => {
  for (const file of [
    "package.json",
    "apps/web/vite.config.ts",
    "apps/web/playwright.config.ts",
    "pnpm-lock.yaml",
    "apps/web/tsconfig.json",
  ]) {
    const result = classifyChanges([file]);
    assert.equal(result.hasBuildConfig, true, file);
    assert.equal(result.hasOther, false, file);
  }
});

test("unrecognised files still get a bounded signal", () => {
  const result = classifyChanges([".github/workflows/ci.yml"]);
  assert.equal(result.hasOther, true);
  assert.equal(result.hasBuildConfig, false);
});

test("mixed changes combine the flags", () => {
  const result = classifyChanges([
    "docs/architecture.md",
    "apps/web/src/i18n.ts",
    "apps/web/e2e/smoke.spec.ts",
    "package.json",
  ]);
  assert.equal(result.docs.length, 1);
  assert.equal(result.code.length, 3);
  assert.equal(result.hasWebSource, true);
  assert.equal(result.hasE2E, true);
  assert.equal(result.hasBuildConfig, true);
});

const failedJobs = [
  {
    name: "verify",
    conclusion: "failure",
    steps: [
      { name: "Check formatting with actionable diffs", conclusion: "failure" },
      { name: "pnpm audit --prod", conclusion: "skipped" },
    ],
  },
  { name: "unit", conclusion: "success", steps: [] },
  { name: "secret-scan", conclusion: "cancelled", steps: [] },
];
// `gh run view --log-failed` rows are job, step, then "timestamp text".
const logLine = (job, text) => `${job}\tStep\t2026-11-10T13:13:15Z ${text}`;

test("a hosted failure names the job, the failed step and the reason", () => {
  const rows = summarizeFailure(
    failedJobs,
    [
      logLine("unit", "1 passed"),
      logLine("verify", "Checking formatting..."),
      logLine("verify", "[warn] Code style issues found in the above file."),
      logLine("secret-scan", "cancelled by user"),
    ].join("\n"),
  );
  assert.deepEqual(rows, [
    {
      job: "verify",
      steps: ["Check formatting with actionable diffs"],
      lines: ["[warn] Code style issues found in the above file."],
    },
  ]);
});

test("CI colours are stripped so the reason reads plainly", () => {
  const [row] = summarizeFailure(
    failedJobs,
    logLine("verify", "\u001b[33mwarn\u001b[39m Code style issues found"),
  );
  assert.deepEqual(row.lines, ["warn Code style issues found"]);
});

test("a failure with no recognisable line still shows where it died", () => {
  const [row] = summarizeFailure(
    failedJobs,
    [
      logLine("verify", "Checking formatting..."),
      logLine("verify", "done"),
    ].join("\n"),
  );
  assert.deepEqual(row.lines, ["Checking formatting...", "done"]);
});

test("the digest stays short enough to read in a terminal", () => {
  const jobs = [
    {
      name: "e2e-shard",
      conclusion: "failure",
      steps: [{ name: "shard 2", conclusion: "failure" }],
    },
  ];
  const log = Array.from({ length: 9 }, (_, index) =>
    logLine("e2e-shard", `Error: spec ${index} failed`),
  ).join("\n");
  const rows = summarizeFailure(jobs, log);
  assert.equal(rows[0].lines.length, 5);
  const long = summarizeFailure(
    [{ name: "verify", conclusion: "failure", steps: [] }],
    logLine("verify", `Error: ${"x".repeat(400)}`),
  );
  const [heading, line] = formatFailure(long, { width: 20 });
  assert.equal(heading, "✗ verify");
  assert.ok(line.endsWith("…"));
  assert.ok(line.length < 40, line);
});

test("finds the error context a failure artifact ships", () => {
  const root = mkdtempSync(path.join(tmpdir(), "verify-"));
  const nested = path.join(root, "kidung-entrance", "retry1");
  mkdirSync(nested, { recursive: true });
  writeFileSync(path.join(nested, "error-context.md"), "# Error details");
  writeFileSync(path.join(root, "trace.zip"), "not a context");
  assert.deepEqual(discoverErrorContexts(root), [
    path.join(nested, "error-context.md"),
  ]);
  assert.deepEqual(discoverErrorContexts(path.join(root, "missing")), []);
});
