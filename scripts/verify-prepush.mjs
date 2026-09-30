import { execFileSync } from "node:child_process";
import { createPrepushPlan } from "./prepush-plan.mjs";

const repoLocalGitVariables = execFileSync(
  "git",
  ["rev-parse", "--local-env-vars"],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/);

function run(command, args, env = {}) {
  const windowsPnpm = process.platform === "win32" && command === "pnpm";
  const executable = windowsPnpm ? (process.env.ComSpec ?? "cmd.exe") : command;
  const executableArgs = windowsPnpm
    ? ["/d", "/s", "/c", "pnpm", ...args]
    : args;
  const childEnvironment = { ...process.env, ...env };
  if (command === "node" && args[0] === "scripts/sync-egys.mjs")
    for (const variable of repoLocalGitVariables)
      delete childEnvironment[variable];
  execFileSync(executable, executableArgs, {
    stdio: "inherit",
    env: childEnvironment,
  });
}

for (const step of createPrepushPlan({ full: process.argv.includes("--full") })) {
  run(step.command, step.args, step.env);
}
