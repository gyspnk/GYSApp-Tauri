import { defineConfig, devices } from "@playwright/test";
import { resolveE2eServerCommand } from "./src/e2e-server-command.js";

export default defineConfig({
  // One `expect` object only: a second key with the same name silently replaced
  // the first, which dropped the screenshot rule below for a whole round while
  // the docs claimed it was active.
  expect: {
    // Screenshots must show the resting state; otherwise a row entrance or a
    // spinner can land in the middle of a comparison and churn every baseline.
    toHaveScreenshot: { animations: "disabled" },
    // Vite compiles a route on its first visit; production/CI retain their
    // original assertion budget and are measured separately from dev mode.
    timeout: process.env.GYS_E2E_DEV === "1" ? 15_000 : 5_000,
  },
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
  // Tests are independent (each builds its own page), so splitting one spec
  // file across workers keeps the heaviest sweep from owning a single worker.
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    // Keep glyph edges grayscale on local and hosted Linux runners. LCD
    // subpixel rasterization otherwise changes colors without changing layout.
    launchOptions: { args: ["--disable-lcd-text"] },
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
