import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  discoverErrorContexts,
  summarizeErrorContexts,
} from "./test-loop-core.mjs";

const BUNDLE = `# Instructions

- Following Playwright test failed.

# Test info

- Name: literature-toolbar.spec.ts >> a landscape phone sees the shelf
- Location: e2e/literature-toolbar.spec.ts:84:1

# Error details

\`\`\`
Error: expect(received).toBeLessThan(390)
    at /repo/apps/web/e2e/literature-toolbar.spec.ts:101:21
\`\`\`
`;

test("a local run names its failing test and first error line", () => {
  const root = mkdtempSync(join(tmpdir(), "explain-local-"));
  const dir = join(root, "literature-toolbar-a-landscape-chromium");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "error-context.md");
  writeFileSync(file, BUNDLE);

  const found = discoverErrorContexts(root, { depth: 2 });
  assert.deepEqual(found, [file]);

  const [row] = summarizeErrorContexts(found);
  assert.equal(
    row.name,
    "literature-toolbar.spec.ts >> a landscape phone sees the shelf",
  );
  // The stack frame is skipped: only the message is worth printing.
  assert.equal(row.error, "Error: expect(received).toBeLessThan(390)");
});

test("a missing directory is empty, not an error", () => {
  assert.deepEqual(
    discoverErrorContexts(join(tmpdir(), "no-such-dir-xyz"), {}),
    [],
  );
});
