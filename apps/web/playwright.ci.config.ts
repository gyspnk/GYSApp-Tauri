import { defineConfig } from "@playwright/test";
import baseConfig from "./playwright.config.js";

export default defineConfig(baseConfig, {
  // CI-only: distribute individual tests instead of whole files so shards stay
  // balanced, then use the hosted runner cores more effectively without the
  // layout contention observed at four workers. Local runs remain conservative.
  fullyParallel: true,
  // The routine set is short and the runner has four cores; the nightly shards
  // keep three so their long sweeps do not fight over layout frames. Six
  // workers cut the design sweep from 533 s to 444 s but produced two
  // contention flakes in three runs (41720846360 kidung polls, 41723760822
  // smoke overflow), so the routine default stays at four until the poll
  // defaults are audited.
  workers:
    process.env.GYS_CI_ROUTINE === "1"
      ? Number(process.env.GYS_CI_WORKERS ?? 4)
      : 3,
  // The two @perf cases assert sub-second warm navigation. Hosted two-core
  // runners cannot meet them (nor can the 8-core ARM host), so they run in the
  // dedicated perf job on main pushes instead of every PR shard.
  // A routine look at one feature runs its own contracts; the four-viewport
  // sweeps repeat what the nightly shards already cover, so they carry the
  // `@nightly` tag and only run when the shards run.
  grepInvert: process.env.GYS_CI_ROUTINE === "1" ? /@perf|@nightly/ : /@perf/,
});
