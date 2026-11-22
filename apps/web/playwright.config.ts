import { defineConfig, devices } from "@playwright/test";
import { resolveE2eServerCommand } from "./src/e2e-server-command.js";
import { ONBOARDED_STATE } from "./e2e/fixtures/onboarded-state.js";

export default defineConfig({
  expect: {
    toHaveScreenshot: { animations: "disabled" },
    timeout: process.env.GYS_E2E_DEV === "1" ? 15_000 : 5_000,
  },
  testDir: "./e2e",
  timeout: 40_000,
  retries: process.env.CI ? 1 : 0,
  snapshotPathTemplate:
    "{testDir}/{testFilePath}-snapshots/{arg}-{platform}{ext}",
  workers: process.env.CI ? 2 : "50%",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:4173",
    launchOptions: { args: ["--disable-lcd-text"] },
    trace: "retain-on-failure",
    serviceWorkers: "block",
    storageState: ONBOARDED_STATE,
  },
  webServer: {
    command: resolveE2eServerCommand(process.env),
    port: 4173,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
