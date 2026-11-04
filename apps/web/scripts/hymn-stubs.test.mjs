import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  hymnStubPaths,
  literatureStubPaths,
  suaraStubPaths,
} from "./hymn-stubs.mjs";

const catalog = JSON.parse(
  await readFile(
    new URL("../public/offline/hymn-catalog.json", import.meta.url),
    "utf8",
  ),
);

test("every catalog hymn gets a stub path", () => {
  const paths = hymnStubPaths(catalog);
  assert.equal(paths.length, catalog.items.length);
  assert.equal(paths.length, 533);
  assert.equal(paths[0], "kidung/hymn-001");
  assert.ok(paths.every((path) => /^kidung\/hymn-\d{3}[A-Z]?$/.test(path)));
});

test("malformed ids are skipped instead of making odd directories", () => {
  assert.deepEqual(
    hymnStubPaths({ items: [{ id: "hymn-001" }, { id: "../evil" }, {}, null] }),
    ["kidung/hymn-001"],
  );
});

test("every literature article gets a stub path and odd ids are skipped", async () => {
  const literature = JSON.parse(
    await readFile(
      new URL("../public/offline/literature.json", import.meta.url),
      "utf8",
    ),
  );
  const paths = literatureStubPaths(literature);
  // Every catalogue row (articles and PDFs) can be opened by its id.
  assert.equal(paths.length, 300);
  assert.ok(paths.every((path) => /^literatur\/[A-Za-z0-9._-]+$/.test(path)));
  assert.deepEqual(
    literatureStubPaths({ items: [{ id: "a/b" }, { id: "ok-id" }] }),
    ["literatur/ok-id"],
  );
});

test("every Suara testimony gets a stub path", async () => {
  const suara = JSON.parse(
    await readFile(
      new URL("../public/offline/suara-sejati.json", import.meta.url),
      "utf8",
    ),
  );
  const paths = suaraStubPaths(suara);
  assert.equal(paths.length, 164);
  assert.ok(paths.every((path) => /^suara\/[A-Za-z0-9._-]+$/.test(path)));
  assert.deepEqual(
    suaraStubPaths({ items: [{ id: "../etc" }, { id: "ok" }] }),
    ["suara/ok"],
  );
});
