import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { findEgysWorkflowViolations } from "./verify-egys-local-only.mjs";

const temporaryDirectories = [];
const repositoryRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("e-GYS local synchronization policy", () => {
  test("detects upstream synchronization commands inside Actions workflows", async () => {
    const root = await mkdtemp(join(tmpdir(), "gys-egys-policy-"));
    temporaryDirectories.push(root);
    const workflows = join(root, ".github", "workflows");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(workflows, { recursive: true }),
    );
    await writeFile(
      join(workflows, "bad.yml"),
      "steps:\n  - run: node scripts/sync-egys.mjs --strict\n",
    );

    const violations = await findEgysWorkflowViolations(root);
    assert.equal(violations.length, 1);
    assert.equal(violations[0].file, ".github/workflows/bad.yml");
  });

  test("allows ordinary CI workflows that only validate generated contracts", async () => {
    const root = await mkdtemp(join(tmpdir(), "gys-egys-policy-"));
    temporaryDirectories.push(root);
    const workflows = join(root, ".github", "workflows");
    await import("node:fs/promises").then(({ mkdir }) =>
      mkdir(workflows, { recursive: true }),
    );
    await writeFile(
      join(workflows, "good.yml"),
      "steps:\n  - run: pnpm verify:generated\n",
    );

    assert.deepEqual(await findEgysWorkflowViolations(root), []);
  });

  test("keeps the checked-in repository free of upstream workflow access", async () => {
    assert.deepEqual(await findEgysWorkflowViolations(repositoryRoot), []);
  });
});
