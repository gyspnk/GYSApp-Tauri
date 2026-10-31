import { readFile } from "node:fs/promises";

/**
 * Summarise a Playwright JSON report by cost.
 *
 *   npx playwright test --reporter=json > /tmp/e2e.json
 *   node scripts/e2e-durations.mjs /tmp/e2e.json
 *
 * Prints the slowest specs and tests so the next optimisation targets measured
 * cost instead of guesses.
 */

const file = process.argv[2];
if (!file) {
  console.error(
    "Usage: node scripts/e2e-durations.mjs <playwright-json-report>",
  );
  process.exit(1);
}

const report = JSON.parse(await readFile(file, "utf8"));

function walk(suite, out) {
  for (const spec of suite.specs ?? []) {
    const file = spec.file ?? suite.file ?? "";
    for (const test of spec.tests ?? []) {
      const result = test.results?.[0];
      if (!result) continue;
      out.push({
        file,
        title: `${spec.title}${test.projectName ? ` [${test.projectName}]` : ""}`,
        status: result.status,
        ms: result.duration ?? 0,
      });
    }
  }
  for (const child of suite.suites ?? []) walk(child, out);
}

const tests = [];
for (const suite of report.suites ?? []) walk(suite, tests);

const format = (ms) =>
  ms >= 60_000 ? `${(ms / 60_000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;

const bySpec = new Map();
for (const test of tests) {
  const entry = bySpec.get(test.file) ?? {
    file: test.file,
    count: 0,
    ms: 0,
    failed: 0,
  };
  entry.count += 1;
  entry.ms += test.ms;
  if (test.status !== "passed" && test.status !== "skipped") entry.failed += 1;
  bySpec.set(test.file, entry);
}

const specs = [...bySpec.values()].sort((left, right) => right.ms - left.ms);
const totalMs = tests.reduce((sum, test) => sum + test.ms, 0);

console.log(
  `Tests: ${tests.length} | test time: ${format(totalMs)} | wall: ${format(report.stats?.duration ?? 0)}`,
);
console.log(`\nSlowest specs (browser time):`);
for (const spec of specs.slice(0, 12)) {
  console.log(
    `  ${format(spec.ms).padStart(7)}  ${String(spec.count).padStart(3)} tests${spec.failed ? ` (${spec.failed} failed)` : ""}  ${spec.file.replace(/^.*e2e\//, "")}`,
  );
}

console.log(`\nSlowest tests:`);
for (const test of [...tests]
  .sort((left, right) => right.ms - left.ms)
  .slice(0, 15)) {
  console.log(
    `  ${format(test.ms).padStart(7)}  ${test.status.padEnd(7)}  ${test.file.replace(/^.*e2e\//, "").slice(0, 34)}  ${test.title.slice(0, 48)}`,
  );
}
