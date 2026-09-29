import { execFileSync } from "node:child_process";

const repoLocalGitVariables = execFileSync(
  "git",
  ["rev-parse", "--local-env-vars"],
  { encoding: "utf8" },
)
  .trim()
  .split(/\r?\n/);

function run(command, args, clearRepoGitEnvironment = false) {
  const windowsPnpm = process.platform === "win32" && command === "pnpm";
  const executable = windowsPnpm ? (process.env.ComSpec ?? "cmd.exe") : command;
  const executableArgs = windowsPnpm
    ? ["/d", "/s", "/c", "pnpm", ...args]
    : args;
  const env = { ...process.env };
  if (clearRepoGitEnvironment)
    for (const variable of repoLocalGitVariables) delete env[variable];
  execFileSync(executable, executableArgs, { stdio: "inherit", env });
}

// Git hooks export this repo's Git environment; e-GYS is a separate checkout.
run("node", ["scripts/sync-egys.mjs", "--write", "--strict"], true);
run("node", ["scripts/check-egys-upstream.mjs", "--write", "--strict"]);
run("pnpm", [
  "exec",
  "prettier",
  "--write",
  "apps/bff/src/egys-contract.ts",
  "docs/discovery/egys-api-contract.json",
]);
run("git", [
  "add",
  "--",
  "docs/discovery/egys-upstream.json",
  "docs/discovery/egys-api-contract.json",
  "apps/bff/src/egys-provenance.ts",
  "apps/bff/src/egys-contract.ts",
]);
run("pnpm", ["verify:docs"]);
run("pnpm", ["verify:generated"]);
const staged = execFileSync("git", ["diff", "--cached", "--name-only"], {
  encoding: "utf8",
});
const rawUpstream = staged
  .split(/\r?\n/)
  .filter((path) => path.startsWith(".tmp-egys-"));
if (rawUpstream.length) {
  throw new Error(
    `Raw e-GYS checkout files cannot be staged: ${rawUpstream.join(", ")}`,
  );
}
run("pnpm", ["--filter", "@gys/contracts", "typecheck"]);
run("pnpm", ["--filter", "@gys/domain", "typecheck"]);
run("pnpm", ["--filter", "@gys/contracts", "test"]);
run("pnpm", ["--filter", "@gys/domain", "test"]);
