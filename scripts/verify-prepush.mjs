import { execFileSync } from "node:child_process";

function run(command, args) {
  const windowsPnpm = process.platform === "win32" && command === "pnpm";
  const executable = windowsPnpm ? (process.env.ComSpec ?? "cmd.exe") : command;
  const executableArgs = windowsPnpm
    ? ["/d", "/s", "/c", "pnpm", ...args]
    : args;
  execFileSync(executable, executableArgs, { stdio: "inherit" });
}

run("node", ["scripts/sync-egys.mjs", "--strict"]);
run("node", ["scripts/check-egys-upstream.mjs", "--strict"]);
run("pnpm", ["format:check"]);
run("pnpm", ["lint"]);
run("pnpm", ["typecheck"]);
run("pnpm", ["native:check"]);
run("pnpm", ["test"]);
run("pnpm", ["build"]);
run("pnpm", ["verify:native-assets"]);
run("pnpm", ["verify:bundle"]);
run("pnpm", ["--filter", "@gys/web", "test:e2e"]);
