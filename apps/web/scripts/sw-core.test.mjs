import assert from "node:assert/strict";
import test from "node:test";
import { coreIntegrityFrom, corePathsFromSw } from "./sw-core.mjs";

const SW = `const CORE = [
  "",
  "index.html",
  "offline/bible/tb-reader.json.gz",
  "offline/faith.json",
  "offline/pack-manifest.json",
].map(withBase);`;

test("reads the precache list from the worker source", () => {
  assert.deepEqual(corePathsFromSw(SW), [
    "",
    "index.html",
    "offline/bible/tb-reader.json.gz",
    "offline/faith.json",
    "offline/pack-manifest.json",
  ]);
});

test("keeps only pack entries the worker precaches", async () => {
  const entries = await coreIntegrityFrom({
    packItems: [
      { path: "offline/faith.json", sha256: "AAAA" },
      { path: "offline/bible/tb-reader.json", sha256: "BBBB" },
    ],
    corePaths: ["offline/bible/tb-reader.json.gz", "offline/faith.json"],
    digestFile: async () => "CCCC",
  });
  assert.deepEqual(entries, {
    "offline/faith.json": "sha256-AAAA",
    "offline/bible/tb-reader.json.gz": "sha256-CCCC",
  });
});

test("covers precached offline files the pack manifest no longer lists", async () => {
  const entries = await coreIntegrityFrom({
    packItems: [],
    corePaths: ["offline/bible/tb-reader.json.gz", "index.html"],
    digestFile: async (path) => (path.endsWith(".gz") ? "DDDD" : "EEEE"),
  });
  assert.deepEqual(entries, {
    "offline/bible/tb-reader.json.gz": "sha256-DDDD",
  });
});
