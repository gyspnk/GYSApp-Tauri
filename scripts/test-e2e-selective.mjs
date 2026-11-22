import { execFileSync, spawnSync } from "node:child_process";
import { statSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildCommand, isFresh, newestSource } from "./e2e-one.mjs";
import { pnpmInvocation, processExitCode } from "./process-result.mjs";
import {
  collectChangedFiles,
  keepExistingSpecArgs,
  resolveSelectiveTestArgs,
} from "./test-e2e-selective-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.resolve(rootDir, "apps", "web");
const userArgs = process.argv.slice(2).filter((arg) => arg !== "--");
const changedFiles = collectChangedFiles({ rootDir });
const plan = resolveSelectiveTestArgs(changedFiles, userArgs);
if (!process.env.CI && !plan.args.some((arg) => arg.startsWith("--config"))) {
  plan.args.unshift("--config=playwright.local.config.ts");
}
const specArgs = plan.args.filter((arg) => /^e2e\/.*\.spec\.ts$/.test(arg));
if (specArgs.length) {
  const kept = keepExistingSpecArgs(plan.args, { webDir, existsSync });
  if (!kept.some((arg) => /^e2e\/.*\.spec\.ts$/.test(arg))) {
    console.log(
      "\n✅ [Selective E2E] every selected spec was deleted by this change; nothing to run.",
    );
    process.exit(0);
  }
  plan.args = kept;
}
// Each contract uses an isolated browser context. Distribute tests across the
// existing bounded worker pool instead of serializing large spec files.
if (!userArgs.some((arg) => arg.startsWith("--fully-parallel")))
  plan.args.push("--fully-parallel");
// CI runs this job in parallel shards; each shard plans the same spec set and
// lets Playwright divide the tests.
if (process.env.GYS_E2E_SHARD && process.env.GYS_E2E_SHARDS) {
  plan.args.push(
    `--shard=${process.env.GYS_E2E_SHARD}/${process.env.GYS_E2E_SHARDS}`,
  );
}

console.log(`\n🔍 [Selective E2E] ${plan.description}`);
if (plan.changedFiles?.length) {
  console.log(
    `📁 Changed files:\n   - ${plan.changedFiles.slice(0, 8).join("\n   - ")}${plan.changedFiles.length > 8 ? `\n   - ... (${plan.changedFiles.length - 8} more)` : ""}`,
  );
}
console.log(`🚀 Running: pnpm exec playwright test ${plan.args.join(" ")}\n`);

const env = { ...process.env };
if (env.GYS_E2E_DEV !== "1") {
  const distIndex = path.join(webDir, "dist", "index.html");
  let fresh = false;
  try {
    fresh =
      env.GYS_E2E_FORCE_BUILD !== "1" &&
      isFresh(statSync(distIndex).mtimeMs, newestSource(webDir));
  } catch {
    fresh = false;
  }
  if (!fresh) {
    const build = buildCommand(env);
    execFileSync(build.command, build.args, {
      cwd: rootDir,
      stdio: "inherit",
      env: build.env,
    });
  }
  env.GYS_E2E_PREBUILT = "1";
}

const invocation = pnpmInvocation(["exec", "playwright", "test", ...plan.args]);
const result = spawnSync(invocation.command, invocation.args, {
  cwd: webDir,
  stdio: "inherit",
  env,
  shell: invocation.shell,
});

if (result.error) console.error(result.error.message);
process.exit(processExitCode(result));
