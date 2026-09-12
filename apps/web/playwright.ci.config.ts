import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

export default defineConfig(baseConfig, {
  // CI-only: distribute individual tests instead of whole files so two shards
  // stay balanced. The ordinary local config keeps its existing semantics.
  fullyParallel: true,
});
