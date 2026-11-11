import assert from "node:assert/strict";
import test from "node:test";

import {
  formatBytes,
  historyRow,
  upsertHistory,
} from "./release-history-row.mjs";

const table = [
  "## Riwayat rilis",
  "",
  "| Putaran | Tag                         | Run           | APK (byte) | Commit     | Catatan              |",
  "| ------- | --------------------------- | ------------- | ---------- | ---------- | -------------------- |",
  "| 226     | `v0.1.0-preview.20261009.1` | `42782473369` | 36 118 859 | `c6979668` | rilis pertama        |",
  "",
  "Setelah tabel.",
].join("\n");

const row = historyRow({
  turn: 276,
  tag: "v0.1.0-preview.20261111.1",
  apkBytes: 36130000,
  run: 43020689948,
  commit: "5798f2af1234",
  note: "signing debug",
});

test("formats bytes like the history table", () => {
  assert.equal(formatBytes(36118859), "36 118 859");
  assert.throws(() => formatBytes("-1"), /whole number, got -1/);
});

test("builds a row in the table's column order", () => {
  assert.equal(
    row,
    "| 276 | `v0.1.0-preview.20261111.1` | `43020689948` | 36 130 000 | `5798f2af` | signing debug |",
  );
});

test("inserts the new row directly after the separator", () => {
  const result = upsertHistory(table, row, 276);
  const lines = result.split("\n");
  assert.equal(
    lines[4],
    "| 276     | `v0.1.0-preview.20261111.1` | `43020689948` | 36 130 000 | `5798f2af` | signing debug |",
  );
  assert.match(result, /\| 226 {5}\|/);
  assert.match(result, /Setelah tabel\./);
});

test("running twice is idempotent", () => {
  const once = upsertHistory(table, row, 276);
  assert.equal(upsertHistory(once, row, 276), once);
});

test("a repeated turn replaces its row instead of adding another", () => {
  const once = upsertHistory(table, row, 276);
  const replaced = upsertHistory(
    once,
    historyRow({
      turn: 276,
      tag: "v0.1.0-preview.20261111.1",
      apkBytes: 36130001,
      run: 43020689948,
      note: "signing debug",
    }),
    276,
  );
  assert.equal(replaced.match(/^\| 276 /gm).length, 1);
  assert.match(replaced, /36 130 001/);
  assert.doesNotMatch(replaced, /36 130 000/);
});

test("fails when the document has no history table", () => {
  assert.throws(
    () => upsertHistory("# tanpa tabel", row, 276),
    /history table with a `Putaran` header was not found/,
  );
});

test("rejects a tag that does not look like a release tag", () => {
  assert.throws(
    () => historyRow({ turn: 276, tag: "latest", apkBytes: 1, run: 1 }),
    /tag must look like/,
  );
});
