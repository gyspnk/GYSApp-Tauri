import { test } from "node:test";
import assert from "node:assert/strict";
import { collectChecks, ownerOf } from "./fast-check.mjs";

test("picks formatting, typecheck and the covering unit file", () => {
  const files = [
    "apps/web/src/egys-google.ts",
    "apps/web/src/egys-google.test.ts",
    "apps/web/src/app-design.css",
    "README.md",
  ];
  const { formatted, sources, tests, typechecks } = collectChecks(files);
  assert.deepEqual(formatted.sort(), [
    "README.md",
    "apps/web/src/app-design.css",
    "apps/web/src/egys-google.test.ts",
    "apps/web/src/egys-google.ts",
  ]);
  assert.deepEqual(sources, ["apps/web/src/egys-google.ts"]);
  assert.deepEqual(tests, ["apps/web/src/egys-google.test.ts"]);
  assert.deepEqual(typechecks, ["@gys/web"]);
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

test("splits the checks by the package that owns the file", () => {
  assert.equal(ownerOf("apps/bff/src/index.ts"), "@gys/bff");
  assert.equal(ownerOf("packages/contracts/src/index.ts"), "@gys/contracts");
  assert.equal(ownerOf("scripts/fast-check.mjs"), undefined);
  const { typechecks, tests } = collectChecks([
    "apps/bff/src/index.test.ts",
    "apps/web/src/egys-google.ts",
  ]);
  assert.deepEqual(typechecks.sort(), ["@gys/bff", "@gys/web"]);
  assert.deepEqual(tests.sort(), [
    "apps/bff/src/index.test.ts",
    "apps/web/src/egys-google.test.ts",
  ]);
});
