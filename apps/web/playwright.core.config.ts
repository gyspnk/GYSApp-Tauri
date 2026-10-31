import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

/**
 * The five-minute loop. A small, curated set that exercises every surface a
 * normal change can break: the shell (smoke), settings and deep links, and the
 * account/provider flow (e-GYS). `navigation-layout` and `appearance` stay in
 * the broad profile; they are the two slowest files of the old list.
 *
 * Anything not listed here still runs through `test:e2e:changed` when a change
 * touches it, and in the full suite before pushing. Keeping this list short is
 * the point: it is the feedback loop, not the release gate.
 */
export default defineConfig(baseConfig, {
  fullyParallel: true,
  // Two browsers saturate an 8-core ARM runner; more workers only add
  // contention (measured: 179s @2, 184s @3, 217s @4 on the same 55 tests).
  workers: Number(process.env.GYS_E2E_WORKERS ?? 2),
  retries: 0,
  reporter: [["line"]],
  testMatch: [
    "**/smoke.spec.ts",
    "**/settings-data-integrity.spec.ts",
    "**/more-section-deeplink.spec.ts",
    "**/more-device-data.spec.ts",
    "**/account-menu.spec.ts",
    "**/egys-v1.spec.ts",
  ],
});
