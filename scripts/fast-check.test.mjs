import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectChecks, ownerOf } from "./fast-check.mjs";

test("CLI fails closed when Git discovery fails", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "gys-fast-check-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const emptyGitConfig = join(cwd, ".empty-gitconfig");
  writeFileSync(emptyGitConfig, "");
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith("GIT_")),
  );
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = emptyGitConfig;
  const cli = fileURLToPath(new URL("./fast-check.mjs", import.meta.url));
  const run = () =>
    spawnSync(process.execPath, [cli], { cwd, env, encoding: "utf8" });
  const git = (...args) =>
    execFileSync("git", args, { cwd, env, stdio: "pipe" });
  const assertFailure = (result) => {
    assert.ifError(result.error);
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Cannot discover changed files against origin\/main/,
    );
    assert.doesNotMatch(result.stdout, /Nothing changed|Local check clean/);
  };

  await t.test("non-repository", () => {
    assertFailure(run());
  });

  git("init", "--initial-branch=main");
  git(
    "-c",
    "user.name=Fixture",
    "-c",
    "user.email=fixture@example.invalid",
    "commit",
    "--allow-empty",
    "--no-gpg-sign",
    "-m",
    "fixture",
  );
  await t.test("missing origin/main", () => {
    assertFailure(run());
  });

  git("update-ref", "refs/remotes/origin/main", "HEAD");
  await t.test("clean repository", () => {
    const result = run();
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, "Nothing changed against origin/main.\n");
    assert.equal(result.stderr, "");
  });
});

test("CLI formats with the exported Prettier bin without pnpm", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "gys-fast-check-format-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const data = join(cwd, "data.json");
  const ignored = join(cwd, "ignored.json");
  writeFileSync(join(cwd, ".prettierrc.json"), '{"printWidth":20}\n');
  writeFileSync(data, '{\n  "items": [\n    "alpha",\n    "beta"\n  ]\n}\n');
  writeFileSync(ignored, '{"ignored":true}\n');
  writeFileSync(join(cwd, ".prettierignore"), "ignored.json\n");

  const cli = fileURLToPath(new URL("./fast-check.mjs", import.meta.url));
  const run = (file = "data.json") =>
    spawnSync(process.execPath, [cli, file], {
      cwd,
      env: { ...process.env, PATH: "" },
      encoding: "utf8",
    });

  const cleanBefore = readFileSync(data, "utf8");
  const clean = run();
  assert.ifError(clean.error);
  assert.equal(clean.status, 0, clean.stderr);
  assert.match(clean.stdout, /All matched files use Prettier code style/);
  assert.equal(readFileSync(data, "utf8"), cleanBefore);

  writeFileSync(data, '{"items":["alpha","beta"]}\n');
  const dirtyBefore = readFileSync(data, "utf8");
  const dirty = run();
  assert.ifError(dirty.error);
  assert.equal(dirty.status, 1);
  assert.match(dirty.stderr, /Code style issues/);
  assert.equal(readFileSync(data, "utf8"), dirtyBefore);

  const ignoredBefore = readFileSync(ignored, "utf8");
  const skipped = run("ignored.json");
  assert.ifError(skipped.error);
  assert.equal(skipped.status, 0, skipped.stderr);
  assert.match(skipped.stdout, /All matched files use Prettier code style/);
  assert.equal(readFileSync(ignored, "utf8"), ignoredBefore);
});

test("CLI reports unresolved Prettier and still runs the related unit file", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "gys-fast-check-missing-prettier-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  copyFileSync(
    fileURLToPath(new URL("./fast-check.mjs", import.meta.url)),
    join(cwd, "fast-check.mjs"),
  );
  mkdirSync(join(cwd, "node_modules", "prettier"), { recursive: true });
  writeFileSync(
    join(cwd, "node_modules", "prettier", "package.json"),
    '{"name":"prettier","version":"0.0.0","exports":{}}\n',
  );
  mkdirSync(join(cwd, "scripts"), { recursive: true });
  writeFileSync(
    join(cwd, "scripts", "probe.mjs"),
    "export const probe = true;\n",
  );
  writeFileSync(
    join(cwd, "scripts", "probe.test.mjs"),
    'import { test } from "node:test";\ntest("probe marker", () => console.log("PROBE_MARKER_RAN"));\n',
  );

  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(
    process.execPath,
    [join(cwd, "fast-check.mjs"), "scripts/probe.mjs"],
    { cwd, env, encoding: "utf8" },
  );
  assert.ifError(result.error);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Cannot resolve the Prettier CLI/);
  assert.match(result.stderr, /Package subpath/);
  assert.match(result.stdout, /PROBE_MARKER_RAN/);
  assert.match(result.stdout, /Local check failed\./);
});

test("picks formatting, typecheck and the covering unit file", () => {
  const files = [
    "apps/web/src/egys-google.ts",
    "apps/web/src/egys-google.test.ts",
    "apps/web/src/styles/01-foundations-and-layout.css",
    "README.md",
  ];
  const { formatted, sources, tests, typechecks } = collectChecks(files);
  assert.deepEqual(formatted.sort(), [
    "README.md",
    "apps/web/src/egys-google.test.ts",
    "apps/web/src/egys-google.ts",
    "apps/web/src/styles/01-foundations-and-layout.css",
  ]);
  assert.deepEqual(sources, ["apps/web/src/egys-google.ts"]);
  // A stylesheet is in this change, so the stylesheet-wide policy suites ride
  // along; the sibling unit file still has to be first.
  assert.equal(tests[0], "apps/web/src/egys-google.test.ts");
  assert.ok(tests.includes("apps/web/src/radius-scale.test.ts"));
  assert.deepEqual(typechecks, ["@gys/web"]);
});

test("ignores files that no longer exist", () => {
  const { formatted, sources, tests } = collectChecks([
    "apps/web/src/missing-module.ts",
    "docs/plans/missing.md",
  ]);
  assert.deepEqual(formatted, []);
  assert.deepEqual(sources, []);
  assert.deepEqual(tests, []);
});

test("splits the checks by the package that owns the file", () => {
  assert.equal(ownerOf("apps/bff/src/index.ts"), "@gys/bff");
  assert.equal(ownerOf("packages/contracts/src/index.ts"), "@gys/contracts");
  assert.equal(ownerOf("scripts/fast-check.mjs"), undefined);
  const { typechecks, tests } = collectChecks([
    "apps/bff/src/index.test.ts",
    "apps/web/src/egys-google.ts",
  ]);
  assert.deepEqual(typechecks.sort(), ["@gys/bff", "@gys/web"]);
  assert.deepEqual(tests.sort(), [
    "apps/bff/src/index.test.ts",
    "apps/web/src/egys-google.test.ts",
  ]);
});

test("a stylesheet edit pulls in the stylesheet-wide policy suites", () => {
  const { tests } = collectChecks([
    "apps/web/src/styles/02-bible-and-settings.css",
  ]);
  for (const policy of ["radius-scale", "spacing-scale", "css-tokens"]) {
    assert.ok(
      tests.some((file) => file.includes(policy)),
      `${policy} should run for a stylesheet edit`,
    );
  }
});

test("a locale edit pulls in the key-set contract", () => {
  const { tests } = collectChecks(["apps/web/src/i18n-en.ts"]);
  assert.deepEqual(tests, ["apps/web/src/i18n.test.ts"]);
});

test("a scripts tool drags its own node test into the check", () => {
  const { tests } = collectChecks(["scripts/issue-queue.mjs"]);
  assert.deepEqual(tests, ["scripts/issue-queue.test.mjs"]);
});

test("a documentation change pulls the documentation gate into the fast check", () => {
  const checks = collectChecks(["docs/plans/ui-spec-loop.md"]);
  assert.equal(checks.docs, true);
  assert.equal(collectChecks(["apps/web/src/app.ts"]).docs, false);
});

test("normalizes Windows separators so sibling web tests stay owned by @gys/web", () => {
  const checks = collectChecks(["apps\\web\\src\\egys-google.ts"]);
  assert.deepEqual(checks.typechecks, ["@gys/web"]);
  assert.deepEqual(checks.tests, ["apps/web/src/egys-google.test.ts"]);
  for (const file of checks.tests) {
    assert.ok(!file.includes("\\"), file);
    assert.equal(ownerOf(file), "@gys/web");
  }
});
