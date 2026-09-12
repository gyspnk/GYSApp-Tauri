import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

export default defineConfig(baseConfig, {
  // CI-only: distribute individual tests instead of whole files so shards stay
  // balanced, then use the hosted runner cores more effectively. The ordinary
  // local config keeps its conservative two-worker semantics.
  fullyParallel: true,
  workers: 4,
});
