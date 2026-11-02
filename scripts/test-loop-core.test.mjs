import assert from "node:assert/strict";
import test from "node:test";
import { classifyChanges } from "./test-loop-core.mjs";

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
