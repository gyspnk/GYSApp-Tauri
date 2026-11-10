import { test } from "node:test";
import assert from "node:assert/strict";
import { collectChecks } from "./fast-check.mjs";

test("picks formatting, typecheck and the covering unit file", () => {
  const files = [
    "apps/web/src/egys-google.ts",
    "apps/web/src/egys-google.test.ts",
    "apps/web/src/app-design.css",
    "README.md",
  ];
  const { formatted, sources, tests } = collectChecks(files);
  assert.deepEqual(formatted.sort(), [
    "README.md",
    "apps/web/src/app-design.css",
    "apps/web/src/egys-google.test.ts",
    "apps/web/src/egys-google.ts",
  ]);
  assert.deepEqual(sources, ["apps/web/src/egys-google.ts"]);
  assert.deepEqual(tests, ["apps/web/src/egys-google.test.ts"]);
});

test("ignores files that no longer exist", () => {
  const { formatted, sources, tests } = collectChecks([
    "apps/web/src/missing-module.ts",
    "docs/plans/missing.md",
  ]);
  assert.deepEqual(formatted, []);
  assert.deepEqual(sources, []);
  assert.deepEqual(tests, []);
});
