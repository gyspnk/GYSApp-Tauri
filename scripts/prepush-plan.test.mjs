import test from "node:test";
import assert from "node:assert/strict";
import { createPrepushPlan } from "./prepush-plan.mjs";

test("pre-push hands verification to Actions instead of running it here", () => {
  const commands = createPrepushPlan().map((step) =>
    `${step.command} ${step.args.join(" ")}`.trim(),
  );

  assert.deepEqual(commands, [
    "node scripts/format-changed.mjs",
    "pnpm verify:docs",
    "node scripts/remote-verify.mjs",
  ]);
});

test("no typecheck, unit, build or browser work runs on the device", () => {
  const commands = createPrepushPlan().map(
    (step) => `${step.command} ${step.args.join(" ")}`,
  );

  for (const forbidden of [
    "pnpm typecheck",
    "pnpm test",
    "pnpm build",
    "pnpm format:check",
    "pnpm verify:bundle",
    "pnpm --filter @gys/web test:e2e",
  ]) {
    assert.equal(
      commands.includes(forbidden),
      false,
      `${forbidden} must not run locally`,
    );
  }
});

test("the same plan applies to push and to explicit release requests", () => {
  assert.deepEqual(createPrepushPlan({ full: true }), createPrepushPlan());
});
