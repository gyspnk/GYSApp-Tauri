import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectChangedFiles,
  resolveSelectiveTestArgs,
} from "./test-e2e-selective-core.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.resolve(rootDir, "apps", "web");
const userArgs = process.argv.slice(2);
const changedFiles = collectChangedFiles({ rootDir });
const plan = resolveSelectiveTestArgs(changedFiles, userArgs);

console.log(`\n🔍 [Selective E2E] ${plan.description}`);
if (plan.changedFiles?.length) {
  console.log(
    `📁 Changed files:\n   - ${plan.changedFiles.slice(0, 8).join("\n   - ")}${plan.changedFiles.length > 8 ? `\n   - ... (${plan.changedFiles.length - 8} more)` : ""}`,
  );
}
console.log(`🚀 Running: pnpm exec playwright test ${plan.args.join(" ")}\n`);

const result = spawnSync("pnpm", ["exec", "playwright", "test", ...plan.args], {
  cwd: webDir,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 0);
