import test from "node:test";
import assert from "node:assert/strict";
import { createPrepushPlan } from "./prepush-plan.mjs";

test("pre-push verification compiles the TypeScript workspace only once", () => {
  const plan = createPrepushPlan({ full: true });
  const pnpmCommands = plan
    .filter((step) => step.command === "pnpm")
    .map((step) => step.args.join(" "));

  assert.equal(pnpmCommands.filter((command) => command === "build").length, 1);
  assert.equal(pnpmCommands.includes("lint"), false);
  assert.equal(pnpmCommands.includes("typecheck"), false);
});

test("full browser verification reuses the pre-push build", () => {
  const plan = createPrepushPlan({ full: true });
  const e2e = plan.find(
    (step) =>
      step.command === "pnpm" &&
      step.args.join(" ") === "--filter @gys/web test:e2e",
  );

  assert.ok(e2e, "full web e2e step should remain in pre-push verification");
  assert.equal(e2e.env?.GYS_E2E_PREBUILT, "1");
});

test("pre-push still keeps non-duplicate quality and native gates", () => {
  const plan = createPrepushPlan({ full: true });
  const commands = plan.map((step) =>
    `${step.command} ${step.args.join(" ")}`.trim(),
  );

  for (const expected of [
    "node scripts/sync-egys.mjs --strict",
    "node scripts/check-egys-upstream.mjs --strict",
    "pnpm format:check",
    "pnpm verify:docs",
    "pnpm verify:generated",
    "pnpm audit:chords:check",
    "pnpm native:check",
    "pnpm test",
    "pnpm build",
    "pnpm verify:native-assets",
    "pnpm verify:bundle",
    "pnpm --filter @gys/web test:e2e",
  ]) {
    assert.ok(
      commands.includes(expected),
      `missing pre-push gate: ${expected}`,
    );
  }
});

test("default pre-push feedback is offline and excludes full release work", () => {
  const commands = createPrepushPlan().map(
    (step) => `${step.command} ${step.args.join(" ")}`,
  );
  assert.deepEqual(commands, [
    "pnpm format:check",
    "pnpm verify:docs",
    "pnpm verify:generated",
    "pnpm typecheck",
    "pnpm test",
  ]);
});
