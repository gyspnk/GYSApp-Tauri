import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  // PDF.js and the FluidSynth worker are intentionally exercised in the same
  // browser flow. Serial contexts keep the verification deterministic on
  // memory-constrained CI runners without changing production concurrency.
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", trace: "retain-on-failure" },
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
