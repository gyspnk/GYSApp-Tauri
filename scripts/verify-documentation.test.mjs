import test from "node:test";
import assert from "node:assert/strict";
import { verifyDocumentation } from "./verify-documentation.mjs";

test("living documentation contains the required architecture and release map", async () => {
  const failures = await verifyDocumentation(process.cwd());
  assert.deepEqual(failures, []);
});
