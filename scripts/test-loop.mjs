import { spawnSync } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  collectChangedFiles,
  resolveSelectiveTestArgs,
} from "./test-e2e-selective-core.mjs";
import { pnpmInvocation } from "./process-result.mjs";

/**
 * The inner loop for this repository. One command, seconds for most edits:
 *
 *   pnpm test:loop
 *
 * Classification:
 *   docs only          → verify:docs + Prettier on the changed files  (~1.5s)
 *   scripts/**         → node script tests + Prettier                 (~2s)
 *   packages/* /src    → workspace typecheck + that package's tests   (~5s)
 *   build config       → build + verify:bundle                        (~16s)
 *   apps/web/src/**    → typecheck + `vitest related` + mapped specs  (12s–3m)
 *   e2e/**             → only the touched spec files                 (~10–60s)
 *
 * A browser step never starts the full suite by accident: changes that map to
 * more than six specs, or to shared/unclassified files, fall back to the
 * 87-test core tier after rebuilding a stale `dist`.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.join(rootDir, "apps", "web");

const changed = collectChangedFiles({ rootDir });
if (!changed.length) {
  console.log("No changed files. Nothing to run.");
  process.exit(0);
}

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

const isDocs = (file) =>
  file.startsWith("docs/") || file.endsWith(".md") || file === "CHANGELOG.md";
const docs = changed.filter(isDocs);
const code = changed.filter((file) => !isDocs(file));

const hasWebSource = code.some((file) => file.startsWith("apps/web/src/"));
const hasPackageSource = code.some((file) =>
  /^packages\/[^/]+\/src\//.test(file),
);
const hasScripts = code.some((file) => file.startsWith("scripts/"));
const hasE2E = code.some(
  (file) => file.startsWith("apps/web/e2e/") && file.endsWith(".spec.ts"),
);
const hasBuildConfig = code.some((file) =>
  /(?:^|\/)(?:vite\.config\.ts|playwright[^/]*\.ts|package\.json|tsconfig[^/]*\.json|pnpm-lock\.yaml)$/.test(
    file,
  ),
);
const hasOther = code.some(
  (file) =>
    !file.startsWith("apps/web/src/") &&
    !file.startsWith("apps/web/e2e/") &&
    !file.startsWith("packages/") &&
    !file.startsWith("scripts/") &&
    !hasBuildConfig,
);

const formatChanged = () =>
  run("format (changed files)", ["exec", "prettier", "--check", ...changed]);

/** Newest mtime under a path (file or directory); 0 when missing. */
async function newestMtime(target) {
  try {
    const info = await stat(target);
    if (!info.isDirectory()) return info.mtimeMs;
    let newest = info.mtimeMs;
    for (const entry of await readdir(target, { withFileTypes: true })) {
      const childTime = await newestMtime(path.join(target, entry.name));
      if (childTime > newest) newest = childTime;
    }
    return newest;
  } catch {
    return 0;
  }
}

/** A browser test against a stale `dist` proves nothing. */
async function ensureFreshBuild() {
  const dist = await newestMtime(path.join(webDir, "dist", "index.html"));
  if (!dist) {
    console.log("\nNo dist build yet: building before the browser step.");
    return run("build", ["build"]) === 0;
  }
  const sources = await Promise.all(
    [
      "apps/web/src",
      "apps/web/index.html",
      "apps/web/vite.config.ts",
      "apps/web/public",
    ].map((entry) => newestMtime(path.join(rootDir, entry))),
  );
  if (Math.max(...sources) <= dist) return true;
  console.log(
    "\nSource is newer than dist: rebuilding before the browser step.",
  );
  return run("build", ["build"]) === 0;
}

console.log(
  `Changed: ${changed.length} file(s) — ${docs.length} doc(s), ${code.length} code/config.`,
);

if (code.length === 0) {
  // Documentation-only edits: nothing the browser or the bundler can see.
  if (run("docs verifier", ["verify:docs"]) !== 0) process.exit(1);
  if (formatChanged() !== 0) process.exit(1);
} else if (
  !hasWebSource &&
  !hasE2E &&
  !hasPackageSource &&
  !hasBuildConfig &&
  !hasOther
) {
  // scripts/** only: the repository's maintained Node suites are the signal.
  if (formatChanged() !== 0) process.exit(1);
  if (run("script tests", ["test:scripts"]) !== 0) process.exit(1);
} else {
  if (hasPackageSource) {
    if (run("workspace typecheck", ["typecheck"]) !== 0) process.exit(1);
    for (const packageName of new Set(
      code
        .filter((file) => /^packages\/[^/]+\/src\//.test(file))
        .map((file) => file.split("/")[1]),
    )) {
      if (
        run(`unit tests: @gys/${packageName}`, [
          "--filter",
          `@gys/${packageName}`,
          "test",
        ]) !== 0
      )
        process.exit(1);
    }
  } else if (hasWebSource || hasBuildConfig) {
    if (run("web typecheck", ["--filter", "@gys/web", "typecheck"]) !== 0)
      process.exit(1);
  }

  if (hasBuildConfig) {
    if (run("build", ["build"]) !== 0) process.exit(1);
    if (run("bundle budget", ["verify:bundle"]) !== 0) process.exit(1);
  }

  if (hasWebSource) {
    const sources = code
      .filter(
        (file) =>
          file.startsWith("apps/web/src/") &&
          /\.(?:ts|tsx)$/.test(file) &&
          !/\.test\./.test(file),
      )
      .map((file) => path.relative(webDir, path.join(rootDir, file)));
    if (sources.length) {
      run("unit tests that import the change", [
        "--filter",
        "@gys/web",
        "exec",
        "vitest",
        "related",
        "--run",
        ...sources,
      ]);
    }
  }

  if (formatChanged() !== 0) process.exit(1);

  if (hasWebSource || hasE2E) {
    const plan = resolveSelectiveTestArgs(code, []);
    const specs = plan.args.filter((arg) => arg.endsWith(".spec.ts"));
    const fullCoverage =
      plan.description.includes("Full browser coverage") ||
      plan.args.length === 0;
    if ((fullCoverage || specs.length > 0) && !(await ensureFreshBuild()))
      process.exit(1);
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
        { env: { ...process.env, GYS_E2E_PREBUILT: "1" } },
      );
    } else {
      console.log(
        `\n↳ ${fullCoverage ? "Shared/unclassified change" : `${specs.length} mapped specs`}: running the 87-test core tier instead of the full suite.`,
      );
      run("browser: core tier", ["test:e2e:core"], {
        env: { ...process.env, GYS_E2E_PREBUILT: "1" },
      });
    }
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
