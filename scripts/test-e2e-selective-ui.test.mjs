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
  assert.ok(plan.args.includes("e2e/responsive-layout-matrix.spec.ts"));
});

test("Kidung presentation changes select the dedicated Kidung usability and visual contracts", () => {
  const plan = resolveSelectiveTestArgs(["apps/web/src/kidung-ux.css"], []);

  assert.ok(plan.args.includes("e2e/kidung-usability.spec.ts"));
  assert.ok(plan.args.includes("e2e/visual.spec.ts"));
  assert.ok(plan.args.includes("e2e/navigation-layout.spec.ts"));
  assert.ok(plan.args.includes("e2e/accessibility.spec.ts"));
  assert.ok(plan.args.includes("e2e/universal-usability.spec.ts"));
  assert.ok(plan.args.includes("e2e/responsive-layout-matrix.spec.ts"));
});

test("extracted Kidung sections retain loading and playlist parity coverage", () => {
  for (const file of [
    "kidung-page.tsx",
    "kidung-catalog.tsx",
    "kidung-local-nav.tsx",
    "kidung-playlist-page.tsx",
    "kidung-settings-page.tsx",
    "kidung-midi-controls.tsx",
    "kidung-shared.ts",
  ]) {
    const plan = resolveSelectiveTestArgs([`apps/web/src/${file}`], []);
    for (const spec of [
      "e2e/kidung-loading.spec.ts",
      "e2e/kidung-offline.spec.ts",
      "e2e/kidung-usability.spec.ts",
      "e2e/playlist-parity.spec.ts",
      "e2e/visual.spec.ts",
      "e2e/accessibility.spec.ts",
    ])
      assert.ok(plan.args.includes(spec), `${file} should select ${spec}`);
  }
});

test("Faith text and gesture edits select reading contracts without unrelated media suites", () => {
  for (const file of ["faith.tsx", "reading-zoom.ts"]) {
    const plan = resolveSelectiveTestArgs([`apps/web/src/${file}`], []);
    for (const spec of [
      "faith-zoom",
      "reading-family-usability",
      "reading-direct-flow",
      "visual-reading",
      "accessibility",
    ])
      assert.ok(plan.args.includes(`e2e/${spec}.spec.ts`), `${file}: ${spec}`);
    assert.ok(!plan.args.includes("e2e/media-load.spec.ts"));
    assert.ok(!plan.description.startsWith("Full browser coverage"));
  }
});

test("shared composition changes retain shell, visual, gesture and responsive coverage", () => {
  const plan = resolveSelectiveTestArgs(["apps/web/src/app-design.css"], []);
  for (const spec of [
    "smoke",
    "sidebar-collapse",
    "ux-refinement",
    "visual",
    "visual-reading",
    "faith-zoom",
    "accessibility",
    "roadmap-ui-matrix",
  ])
    assert.ok(plan.args.includes(`e2e/${spec}.spec.ts`), spec);
  assert.ok(!plan.description.startsWith("Full browser coverage"));
});
