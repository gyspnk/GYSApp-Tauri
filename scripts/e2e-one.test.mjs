import test from "node:test";
import assert from "node:assert/strict";
import { buildCommand, isFresh, playwrightArgs } from "./e2e-one.mjs";

test("hands specs and flags to Playwright in a fixed project", () => {
  assert.deepEqual(playwrightArgs(["e2e/a.spec.ts", "-g", "one"]), [
    "exec",
    "playwright",
    "test",
    "e2e/a.spec.ts",
    "-g",
    "one",
    "--project=chromium",
    "--reporter=line",
  ]);
});

test("builds through the local-heavy opt-in", () => {
  const build = buildCommand({ PATH: "/bin" });
  assert.equal(build.command, "pnpm");
  assert.deepEqual(build.args, ["--filter", "@gys/web", "build"]);
  assert.equal(build.env.GYS_ALLOW_LOCAL_HEAVY, "1");
  assert.equal(build.env.PATH, "/bin");
});

test("the rebuild is skipped only when dist is not older than the sources", () => {
  assert.equal(isFresh(200, 100), true);
  assert.equal(isFresh(100, 200), false);
  assert.equal(isFresh(100, 100), true);
  assert.equal(isFresh(Number.NaN, 100), false);
});
