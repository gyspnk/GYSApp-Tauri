import { defineConfig, devices } from "@playwright/test";
import { resolveE2eServerCommand } from "./src/e2e-server-command.js";

export default defineConfig({
  testDir: "./e2e",
  // Sequential e2e shares one preview server; a 30s budget intermittently
  // starves first-hit navigations (cold asset compile) on slower runners.
  timeout: 40_000,
  // A few specs fetch immutable upstream fixtures (gyschordweb raw CDN).
  // One retry absorbs transient upstream hiccups without masking real bugs.
  retries: 1,
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}",
  workers: 2,
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    // Service workers reload the page when they take control (SKIP_WAITING +
    // controllerchange). Existing contexts reload mid-test otherwise, so e2e
    // runs against the first paint; PWA metadata is still verified through
    // page.request against the built sw.js in runtime-health.spec.ts.
    serviceWorkers: "block",
  },
  webServer: {
    // Local clean checkouts still build all workspace entrypoints automatically.
    // CI may set GYS_E2E_PREBUILT=1 after downloading the verified web build,
    // which starts preview directly and avoids compiling the monorepo twice.
    command: resolveE2eServerCommand(process.env),
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
