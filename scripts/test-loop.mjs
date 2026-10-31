import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectChangedFiles,
  resolveSelectiveTestArgs,
} from "./test-e2e-selective-core.mjs";
import { pnpmInvocation } from "./process-result.mjs";

/**
 * One command for the inner loop, tuned for this repository and host.
 *
 *   pnpm test:loop
 *
 * - docs-only changes run the documentation verifier and Prettier (seconds);
 * - code changes run the incremental typecheck, the unit tests that actually
 *   import the touched modules (`vitest related`), and only the browser specs
 *   the change maps to (fully parallel, two workers, no retries);
 * - the preview build is reused when it exists (`GYS_E2E_PREBUILT=1`).
 *
 * The full suite stays a background/pre-push job: 826 tests need ~40 minutes
 * of browser work on the 8-core ARM host.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");

const changed = collectChangedFiles({ rootDir });
if (!changed.length) {
  console.log("No changed files. Nothing to run.");
  process.exit(0);
}

const isDocs = (file) =>
  file.startsWith("docs/") || file.endsWith(".md") || file === "CHANGELOG.md";
const docs = changed.filter(isDocs);
const code = changed.filter((file) => !isDocs(file));

const results = [];
function run(label, args, { cwd = rootDir, env = process.env } = {}) {
  const started = Date.now();
  const invocation = pnpmInvocation(args, { env });
  console.log(`\n▶ ${label}`);
  const result = spawnSync(invocation.command, invocation.args, {
    cwd,
    env,
    shell: invocation.shell,
    stdio: "inherit",
  });
  const seconds = (Date.now() - started) / 1000;
  const code = result.error || result.signal ? 1 : (result.status ?? 1);
  results.push({ label, code, seconds });
  return code;
}

console.log(
  `Changed: ${changed.length} file(s) — ${docs.length} doc(s), ${code.length} code/config.`,
);

// Formatting only needs the files that changed; scanning the whole repo costs
// ~20s on this host and hides the signal behind noise.
const formatStep = () =>
  run("format (changed files)", ["exec", "prettier", "--check", ...changed]);

if (code.length === 0) {
  // Documentation-only edits: the browser suite cannot observe them.
  if (run("docs verifier", ["verify:docs"]) !== 0) process.exit(1);
  if (formatStep() !== 0) process.exit(1);
} else {
  const webTypecheck = run("web typecheck", [
    "--filter",
    "@gys/web",
    "typecheck",
  ]);
  if (webTypecheck !== 0) process.exit(1);

  const sources = code
    .filter(
      (file) =>
        file.startsWith("apps/web/src/") &&
        /\.(?:ts|tsx)$/.test(file) &&
        !/\.test\./.test(file),
    )
    .map((file) => path.relative(webDir, path.join(rootDir, file)));
  if (sources.length) {
    run(
      "unit tests that import the change",
      [
        "--filter",
        "@gys/web",
        "exec",
        "vitest",
        "related",
        "--run",
        ...sources,
      ],
      { cwd: rootDir },
    );
  }

  if (formatStep() !== 0) process.exit(1);

  const plan = resolveSelectiveTestArgs(code, []);
  const specs = plan.args.filter((arg) => arg.endsWith(".spec.ts"));
  const fullCoverage =
    plan.description.includes("Full browser coverage") ||
    plan.args.length === 0;
  // A loop command must stay bounded: a change that maps to half the suite gets
  // the core tier (3.4 min) and a pointer to the explicit selective run, rather
  // than silently spending forty minutes in the inner loop.
  if (!fullCoverage && specs.length > 0 && specs.length <= 6) {
    run(
      `browser: ${plan.description}`,
      [
        "--filter",
        "@gys/web",
        "exec",
        "playwright",
        "test",
        "--workers",
        "2",
        "--fully-parallel",
        "--retries",
        "0",
        ...plan.args,
      ],
      { cwd: rootDir, env: { ...process.env, GYS_E2E_PREBUILT: "1" } },
    );
  } else {
    console.log(
      `\n↳ ${fullCoverage ? "Shared/unclassified change" : `${specs.length} mapped specs`}: running the 87-test core tier instead of the full suite.`,
    );
    console.log(
      `  For the exact mapping run: pnpm test:e2e:changed ${plan.description.includes("Full browser coverage") ? "" : plan.args.join(" ")}`,
    );
    run("browser: core tier", ["test:e2e:core"], {
      cwd: rootDir,
      env: { ...process.env, GYS_E2E_PREBUILT: "1" },
    });
  }
}

const failed = results.filter((result) => result.code !== 0);
const total = results.reduce((sum, result) => sum + result.seconds, 0);
console.log("\nLoop summary:");
for (const result of results) {
  console.log(
    `  ${result.code === 0 ? "PASS" : "FAIL"}  ${result.label}  (${result.seconds.toFixed(1)}s)`,
  );
}
console.log(`  total ${total.toFixed(1)}s`);
process.exit(failed.length ? 1 : 0);
