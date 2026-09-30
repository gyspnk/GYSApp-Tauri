import test from "node:test";
import assert from "node:assert/strict";
import { processExitCode } from "./process-result.mjs";

test("preserves the test runner exit code", () => {
  assert.equal(processExitCode({ status: 0 }), 0);
  assert.equal(processExitCode({ status: 2 }), 2);
});

test("spawn failure and signal termination cannot pass verification", () => {
  assert.equal(
    processExitCode({ status: null, error: new Error("ENOENT") }),
    1,
  );
  assert.equal(processExitCode({ status: null, signal: "SIGTERM" }), 1);
  assert.equal(processExitCode({}), 1);
});
