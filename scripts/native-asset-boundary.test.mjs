import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { assertNoBuildSourceAssets } from "./native-asset-boundary.mjs";

test("runtime assets keep SQL support and content without shipping the source database", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gys-assets-"));
  try {
    await mkdir(join(directory, "offline", "bible"), { recursive: true });
    await writeFile(
      join(directory, "offline", "bible", "tb-reader.json"),
      "{}",
    );
    await writeFile(join(directory, "sql-wasm.wasm"), "runtime");
    await mkdir(join(directory, "vendor"), { recursive: true });
    await writeFile(
      join(directory, "vendor", "midi-render-worker.js"),
      "runtime",
    );
    await writeFile(join(directory, "startup.js"), "bootstrap");
    await writeFile(join(directory, "sw.js"), "worker");
    await assertNoBuildSourceAssets(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("an accidentally copied SQLite build source is rejected even in a nested directory", async () => {
  const directory = await mkdtemp(join(tmpdir(), "gys-assets-"));
  try {
    const nested = join(directory, "packages", "contracts", "source", "bible");
    await mkdir(nested, { recursive: true });
    await writeFile(join(nested, "b_tb.db"), "SQLite format 3");
    await assert.rejects(
      assertNoBuildSourceAssets(directory),
      /SQLite build source is forbidden.*b_tb\.db/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const file of [
  "fork-pdf.test.js",
  "fork-pdf.d.ts",
  "assets/fork-pdf.js.map",
]) {
  test(`typechecker output ${file} cannot enter runtime assets`, async () => {
    const directory = await mkdtemp(join(tmpdir(), "gys-typecheck-assets-"));
    try {
      await mkdir(join(directory, "assets"), { recursive: true });
      await writeFile(join(directory, file), "compiler output");
      await assert.rejects(
        assertNoBuildSourceAssets(directory),
        /TypeScript build output is forbidden/,
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
