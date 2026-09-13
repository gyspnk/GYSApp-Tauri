import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

export default defineConfig(baseConfig, {
  // CI-only: distribute individual tests instead of whole files so shards stay
  // balanced, then use the hosted runner cores more effectively without the
  // layout contention observed at four workers. Local runs remain conservative.
  fullyParallel: true,
  workers: 3,
});
