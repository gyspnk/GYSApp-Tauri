import { spawnSync } from "node:child_process";
import { pnpmInvocation, processExitCode } from "./process-result.mjs";

const invocation = pnpmInvocation([
  "--filter",
  "@gys/web",
  "exec",
  "playwright",
  "test",
  "e2e/performance.spec.ts",
  "--workers=1",
  ...process.argv.slice(2),
]);
const result = spawnSync(invocation.command, invocation.args, {
  stdio: "inherit",
  shell: invocation.shell,
  env: {
    ...process.env,
    GYS_PERF_SAMPLES: process.env.GYS_PERF_SAMPLES ?? "30",
  },
});
if (result.error) console.error(result.error.message);
process.exit(processExitCode(result));
