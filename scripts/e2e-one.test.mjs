import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommand,
  changedFiles,
  isFresh,
  playwrightArgs,
  runSummary,
} from "./e2e-one.mjs";

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

test("changedFiles merges the branch diff with uncommitted paths", () => {
  const calls = [];
  const files = changedFiles((args) => {
    calls.push(args.join(" "));
    return args[0] === "diff"
      ? "apps/web/src/a.ts\napps/web/src/b.ts\n"
      : " M apps/web/src/b.ts\n?? scripts/new.mjs\n";
  });
  assert.deepEqual(files, [
    "apps/web/src/a.ts",
    "apps/web/src/b.ts",
    "scripts/new.mjs",
  ]);
  assert.deepEqual(calls, [
    "diff --name-only origin/main...HEAD",
    "status --porcelain",
  ]);
});

test("runSummary names the contract and the seconds", () => {
  assert.equal(
    runSummary(["e2e/faith-layers.spec.ts"], 12_340),
    "e2e:one: faith-layers.spec.ts in 12.3s",
  );
  assert.equal(
    runSummary(["e2e/a.spec.ts", "e2e/b.spec.ts", "-g", "title"], 5_000),
    "e2e:one: 2 contracts in 5.0s",
  );
  assert.equal(runSummary(["--changed"], 2_000), "e2e:one: suite in 2.0s");
});
