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
  // A stylesheet is in this change, so the stylesheet-wide policy suites ride
  // along; the sibling unit file still has to be first.
  assert.equal(tests[0], "apps/web/src/egys-google.test.ts");
  assert.ok(tests.includes("apps/web/src/radius-scale.test.ts"));
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

test("a stylesheet edit pulls in the stylesheet-wide policy suites", () => {
  const { tests } = collectChecks([
    "apps/web/src/styles/02-bible-and-settings.css",
  ]);
  for (const policy of ["radius-scale", "spacing-scale", "css-tokens"]) {
    assert.ok(
      tests.some((file) => file.includes(policy)),
      `${policy} should run for a stylesheet edit`,
    );
  }
});

test("a locale edit pulls in the key-set contract", () => {
  const { tests } = collectChecks(["apps/web/src/i18n-en.ts"]);
  assert.deepEqual(tests, ["apps/web/src/i18n.test.ts"]);
});

test("a scripts tool drags its own node test into the check", () => {
  const { tests } = collectChecks(["scripts/issue-queue.mjs"]);
  assert.deepEqual(tests, ["scripts/issue-queue.test.mjs"]);
});

test("a documentation change pulls the documentation gate into the fast check", () => {
  const checks = collectChecks(["docs/plans/ui-spec-loop.md"]);
  assert.equal(checks.docs, true);
  assert.equal(collectChecks(["apps/web/src/app.ts"]).docs, false);
});
