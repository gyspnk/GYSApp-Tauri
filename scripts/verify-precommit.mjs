import { execFileSync } from "node:child_process";

function run(command, args, options = {}) {
  const windowsPnpm = process.platform === "win32" && command === "pnpm";
  const executable = windowsPnpm ? (process.env.ComSpec ?? "cmd.exe") : command;
  const executableArgs = windowsPnpm
    ? ["/d", "/s", "/c", "pnpm", ...args]
    : args;
  execFileSync(executable, executableArgs, { stdio: "inherit", ...options });
}

// Read the index rather than the working tree: partially staged files remain
// untouched, and committing a UI change never refreshes an upstream checkout.
const staged = execFileSync(
  "git",
  ["diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z"],
  { encoding: "utf8" },
)
  .split("\0")
  .filter(Boolean);
const rawUpstream = staged.filter((path) => path.startsWith(".tmp-egys-"));
if (rawUpstream.length) {
  throw new Error(
    `Raw e-GYS checkout files cannot be staged: ${rawUpstream.join(", ")}`,
  );
}

const formatted = staged.filter((path) =>
  /\.(?:[cm]?js|jsx|ts|tsx|json|css|scss|html|md|ya?ml)$/i.test(path),
);
for (const path of formatted) {
  const input = execFileSync("git", ["show", `:${path}`]);
  run(
    "pnpm",
    ["exec", "prettier", "--check", "--ignore-unknown", "--stdin-filepath", path],
    { input, stdio: ["pipe", "inherit", "inherit"] },
  );
}

if (staged.some((path) => path.startsWith("docs/") || path === "README.md"))
  run("pnpm", ["verify:docs"]);
if (
  staged.some(
    (path) =>
      path.startsWith("packages/contracts/generated/") ||
      path.startsWith("apps/web/public/offline/") ||
      path.includes("egys-contract") ||
      path.includes("egys-provenance"),
  )
)
  run("pnpm", ["verify:generated"]);
