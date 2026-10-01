import test from "node:test";
import assert from "node:assert/strict";
import {
  collectChangedFiles,
  resolveSelectiveTestArgs,
} from "./test-e2e-selective-core.mjs";

function fakeExec(outputs, commands) {
  return (command) => {
    commands.push(command);
    if (Object.hasOwn(outputs, command)) return outputs[command];
    throw new Error(`unexpected command: ${command}`);
  };
}

test("explicit PR base and head refs use a clean-checkout git range", () => {
  const commands = [];
  const changed = collectChangedFiles({
    rootDir: "/repo",
    env: {
      GYS_E2E_BASE: "base-sha",
      GYS_E2E_HEAD: "head-sha",
    },
    execSyncImpl: fakeExec(
      {
        "git diff --name-only base-sha...head-sha":
          "apps/web/src/bible.tsx\napps/web/e2e/accessibility.spec.ts\n",
      },
      commands,
    ),
  });

  assert.deepEqual(changed, [
    "apps/web/src/bible.tsx",
    "apps/web/e2e/accessibility.spec.ts",
  ]);
  assert.deepEqual(commands, ["git diff --name-only base-sha...head-sha"]);
});

test("local mode still combines working-tree and HEAD changes", () => {
  const commands = [];
  const changed = collectChangedFiles({
    rootDir: "/repo",
    env: {},
    execSyncImpl: fakeExec(
      {
        "git status --porcelain -uall":
          " M apps/web/src/App.tsx\n?? apps/web/src/new-file.ts\n",
        "git diff --name-only HEAD": "apps/web/src/styles.css\n",
      },
      commands,
    ),
  });

  assert.deepEqual(changed.sort(), [
    "apps/web/src/App.tsx",
    "apps/web/src/new-file.ts",
    "apps/web/src/styles.css",
  ]);
  assert.deepEqual(commands, [
    "git status --porcelain -uall",
    "git diff --name-only HEAD",
  ]);
});

test("a partial PR range falls back to local detection instead of guessing", () => {
  const commands = [];
  collectChangedFiles({
    rootDir: "/repo",
    env: { GYS_E2E_BASE: "base-only" },
    execSyncImpl: fakeExec(
      {
        "git status --porcelain -uall": "",
        "git diff --name-only HEAD": "",
      },
      commands,
    ),
  });

  assert.deepEqual(commands, [
    "git status --porcelain -uall",
    "git diff --name-only HEAD",
  ]);
});

test("Bible render modules include annotation migration and visual contracts without title filtering", () => {
  for (const module of [
    "bible.tsx",
    "bible-chapter.tsx",
    "bible-verse-text.tsx",
  ]) {
    const result = resolveSelectiveTestArgs([`apps/web/src/${module}`], []);
    for (const spec of [
      "bible-annotations",
      "navigation-layout",
      "visual",
      "accessibility",
    ]) {
      assert.ok(
        result.args.includes(`e2e/${spec}.spec.ts`),
        `${module}: ${spec}`,
      );
    }
    assert.ok(
      !result.args.includes("-g"),
      `${module}: include untitled legacy migration`,
    );
  }
});

test("unknown shared code broadens coverage even beside a known feature", () => {
  for (const path of [
    "apps/web/src/service-worker-updates.ts",
    "apps/web/src/snapshot-selector.ts",
    "apps/web/src/styles/00-tokens.css",
    "packages/domain/src/cache.ts",
    "apps/web/public/sw.js",
    "pnpm-lock.yaml",
  ]) {
    const result = resolveSelectiveTestArgs(
      ["apps/web/src/bible.tsx", path],
      ["--retries=0"],
    );
    assert.deepEqual(result.args, ["--retries=0"], path);
    assert.match(result.description, /Full browser coverage/);
  }
});

test("extracted Bible and hymn payload modules retain migration and loading contracts", () => {
  for (const path of [
    "bible-notes-popup.tsx",
    "bible-search-panel.tsx",
    "bible-reader-storage.ts",
  ]) {
    const plan = resolveSelectiveTestArgs([`apps/web/src/${path}`], []);
    assert.ok(plan.args.includes("e2e/bible-annotations.spec.ts"));
    assert.ok(plan.args.includes("e2e/reader-data-loading.spec.ts"));
    assert.ok(!plan.args.includes("-g"));
  }
  const plan = resolveSelectiveTestArgs(["apps/web/src/hymn-payloads.ts"], []);
  assert.ok(plan.args.includes("e2e/kidung-offline.spec.ts"));
  assert.ok(plan.args.includes("e2e/reader-data-loading.spec.ts"));
});
