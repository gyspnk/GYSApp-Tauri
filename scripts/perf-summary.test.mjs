import assert from "node:assert/strict";
import { test } from "node:test";
import { summarise } from "./perf-summary.mjs";

test("takes the last anchored row and ignores code frames", () => {
  const raw = [
    "    console.log(`[perf-row] ${JSON.stringify(row)}`);",
    '17:32:47 [perf-row] {"id":"home","viewport":"phone","readyMs":481,"domContentLoadedMs":300,"layoutShift":0.003,"longTaskDuration":0}',
    '17:32:48 [perf-row] {"id":"bible","viewport":"phone","readyMs":554,"domContentLoadedMs":300,"layoutShift":0.013,"longTaskDuration":0}',
  ].join("\n");
  const out = summarise(raw);
  assert.match(out, /\| home \| phone \| 481 \|/);
  assert.match(out, /\| bible \| phone \| 554 \|/);
});

test("reports navigation steps when present", () => {
  const raw =
    '[runtime-navigation] [{"id":"beranda-alkitab","ms":148},{"id":"alkitab-kidung","ms":1086}]';
  const out = summarise(raw);
  assert.match(out, /\| alkitab-kidung \| 1086 \|/);
});

test("says so when nothing was printed", () => {
  assert.equal(
    summarise("build failed"),
    "No measurement rows were printed.\n",
  );
});
