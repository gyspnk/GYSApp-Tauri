/** Never report a successful test when spawning failed or a signal killed it. */
export function processExitCode(result) {
  if (result.error || result.signal) return 1;
  return typeof result.status === "number" ? result.status : 1;
}

/** Run pnpm's JavaScript entry directly so regexes/spaces stay literal on Windows. */
export function pnpmInvocation(
  args,
  {
    env = process.env,
    platform = process.platform,
    execPath = process.execPath,
  } = {},
) {
  const cli = env.npm_execpath;
  if (cli && /[/\\]pnpm\.(?:cjs|mjs|js)$/i.test(cli))
    return { command: execPath, args: [cli, ...args], shell: false };
  return { command: "pnpm", args, shell: platform === "win32" };
}
