import { spawnSync } from "node:child_process";
import { pnpmInvocation, processExitCode } from "./process-result.mjs";

const invocation = pnpmInvocation([
  "--filter",
  "@gys/web",
  "exec",
  "playwright",
  "test",
  ...process.argv.slice(2),
]);
const result = spawnSync(invocation.command, invocation.args, {
  stdio: "inherit",
  shell: invocation.shell,
  env: { ...process.env, GYS_E2E_DEV: "1" },
});
if (result.error) console.error(result.error.message);
process.exit(processExitCode(result));
