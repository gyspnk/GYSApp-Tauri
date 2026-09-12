import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

export default defineConfig(baseConfig, {
  // Benchmark-only: distribute individual tests instead of whole files so CI
  // shards can be balanced without changing the normal local test semantics.
  fullyParallel: true,
});
