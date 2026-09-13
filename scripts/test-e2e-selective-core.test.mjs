import test from "node:test";
import assert from "node:assert/strict";
import { collectChangedFiles } from "./test-e2e-selective-core.mjs";

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
