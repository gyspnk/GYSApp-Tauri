import { spawnSync } from "node:child_process";
import { processExitCode } from "./process-result.mjs";

const result = spawnSync(
  "pnpm",
  [
    "--filter",
    "@gys/web",
    "exec",
    "playwright",
    "test",
    "e2e/performance.spec.ts",
    "--workers=1",
    ...process.argv.slice(2),
  ],
  {
    stdio: "inherit",
    shell: true,
    env: {
      ...process.env,
      GYS_PERF_SAMPLES: process.env.GYS_PERF_SAMPLES ?? "30",
    },
  },
);
if (result.error) console.error(result.error.message);
process.exit(processExitCode(result));
