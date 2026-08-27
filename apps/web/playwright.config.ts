import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
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
    // The app imports workspace packages from their generated `dist` entrypoints.
    // Build from the monorepo root so a clean checkout (CI or a new developer
    // machine) does not depend on ignored workspace artifacts being present.
    command:
      "pnpm --dir ../.. build && pnpm exec vite preview --host 127.0.0.1 --port 4173",
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
