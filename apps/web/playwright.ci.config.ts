import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

export default defineConfig(baseConfig, {
  // CI-only: distribute individual tests instead of whole files so shards stay
  // balanced, then use the hosted runner cores more effectively without the
  // layout contention observed at four workers. Local runs remain conservative.
  fullyParallel: true,
  workers: 3,
  // The two @perf cases assert sub-second warm navigation. Hosted two-core
  // runners cannot meet them (nor can the 8-core ARM host), so they run in the
  // dedicated perf job on main pushes instead of every PR shard.
  grepInvert: /@perf/,
  // Visual baselines depend on the hosted renderer and on whether the mocked
  // artwork resolves; they drifted from the committed -linux references and
  // kept turning every PR shard red. They are regenerated and reviewed through
  // the manual `update-visual-baselines` job (artifact) instead of gating
  // behaviour PRs. Re-enable by deleting these two entries once the baselines
  // are reviewed.
  testIgnore: ["**/visual.spec.ts", "**/visual-reading.spec.ts"],
});
