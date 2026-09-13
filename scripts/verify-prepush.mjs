import { execFileSync } from "node:child_process";
import { createPrepushPlan } from "./prepush-plan.mjs";

function run(command, args, env = {}) {
  const windowsPnpm = process.platform === "win32" && command === "pnpm";
  const executable = windowsPnpm ? (process.env.ComSpec ?? "cmd.exe") : command;
  const executableArgs = windowsPnpm
    ? ["/d", "/s", "/c", "pnpm", ...args]
    : args;
  execFileSync(executable, executableArgs, {
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

for (const step of createPrepushPlan()) {
  run(step.command, step.args, step.env);
}
