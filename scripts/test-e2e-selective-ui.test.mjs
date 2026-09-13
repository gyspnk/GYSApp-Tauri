import test from "node:test";
import assert from "node:assert/strict";
import { resolveSelectiveTestArgs } from "./test-e2e-selective-core.mjs";

test("appearance preference changes select the dedicated visual/usability contracts", () => {
  const plan = resolveSelectiveTestArgs(
    [
      "apps/web/src/ui-preferences.ts",
      "apps/web/src/ui-preferences-panel.tsx",
      "apps/web/src/calm-liturgical.css",
    ],
    [],
  );

  assert.ok(plan.args.includes("e2e/appearance-preferences.spec.ts"));
  assert.ok(plan.args.includes("e2e/smoke.spec.ts"));
  assert.ok(plan.args.includes("e2e/navigation-layout.spec.ts"));
  assert.ok(plan.args.includes("e2e/accessibility.spec.ts"));
  assert.ok(plan.args.includes("e2e/universal-usability.spec.ts"));
});
