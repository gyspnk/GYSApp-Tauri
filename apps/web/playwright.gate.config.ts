import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

/**
 * "Opsi B" from the plan: a pre-push gate that keeps behaviour coverage and
 * leaves the nine heaviest specs to CI or the owner's machine.
 *
 * Measured basis (826-test JSON report): the excluded specs cost 29.1 minutes
 * of browser time, so this profile should land around 22 minutes of wall time
 * at two workers instead of 35. Every excluded path still runs through
 * `test:loop`/`test:e2e:changed` when a change touches it, and through the full
 * suite in CI.
 */
export default defineConfig(baseConfig, {
  fullyParallel: true,
  workers: Number(process.env.GYS_E2E_WORKERS ?? 2),
  retries: 0,
  reporter: [["line"]],
  testIgnore: [
    "**/visual.spec.ts",
    "**/visual-reading.spec.ts",
    "**/visual-consistency-matrix.spec.ts",
    "**/runtime-performance-baseline.spec.ts",
    "**/kidung-usability.spec.ts",
    "**/editorial-ui.spec.ts",
    "**/roadmap-ui-matrix.spec.ts",
    "**/pdf-shared-viewer.spec.ts",
    "**/navigation-layout.spec.ts",
    "**/appearance-preferences.spec.ts",
    "**/ui-polish.spec.ts",
    "**/reader-motion-continuity.spec.ts",
    "**/responsive-layout-matrix.spec.ts",
  ],
});
