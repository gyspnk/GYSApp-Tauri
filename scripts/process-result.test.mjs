import test from "node:test";
import assert from "node:assert/strict";
import { pnpmInvocation, processExitCode } from "./process-result.mjs";

test("preserves the test runner exit code", () => {
  assert.equal(processExitCode({ status: 0 }), 0);
  assert.equal(processExitCode({ status: 2 }), 2);
});

test("Windows pnpm scripts preserve spaces and regex operators without cmd parsing", () => {
  const args = [
    "exec",
    "playwright",
    "test",
    "-g",
    "Bible typography|shell navigation",
  ];
  assert.deepEqual(
    pnpmInvocation(args, {
      env: { npm_execpath: "C:\\tools\\pnpm.cjs" },
      platform: "win32",
      execPath: "C:\\node.exe",
    }),
    {
      command: "C:\\node.exe",
      args: ["C:\\tools\\pnpm.cjs", ...args],
      shell: false,
    },
  );
});

test("direct Unix runners do not interpret regexes through a shell", () => {
  const args = ["test", "-g", "one|two"];
  assert.deepEqual(pnpmInvocation(args, { env: {}, platform: "linux" }), {
    command: "pnpm",
    args,
    shell: false,
  });
});

test("an npm launcher is not mistaken for pnpm", () => {
  assert.equal(
    pnpmInvocation([], {
      env: { npm_execpath: "/usr/bin/npm-cli.js" },
      platform: "linux",
    }).command,
    "pnpm",
  );
});

test("spawn failure and signal termination cannot pass verification", () => {
  assert.equal(
    processExitCode({ status: null, error: new Error("ENOENT") }),
    1,
  );
  assert.equal(processExitCode({ status: null, signal: "SIGTERM" }), 1);
  assert.equal(processExitCode({}), 1);
});
