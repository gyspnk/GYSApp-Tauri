import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { formatCadence, nextCadence } from "./release-cadence-write.mjs";

const cadence = {
  intervalTurns: 25,
  lastTurn: 251,
  lastTag: "v0.1.0-preview.20261110.2",
  nextDueTurn: 276,
  history: [
    {
      turn: 226,
      tag: "v0.1.0-preview.20261110.1",
      commit: "c69796687aab",
      apkBytes: 36118859,
      run: 42782473369,
    },
    {
      turn: 251,
      tag: "v0.1.0-preview.20261110.2",
      commit: "5e5ebdfca6",
      apkBytes: 36120363,
      run: 42910081054,
    },
  ],
};

const entry = {
  turn: 276,
  tag: "v0.1.0-preview.20261111.1",
  commit: "8c1ef3290000",
  apkBytes: 36130000,
  run: 43020689948,
  url: "https://github.com/gyspnk/GYSApp-Tauri/releases/tag/v0.1.0-preview.20261111.1",
  signing: "Android debug identity",
};

test("records the release turn and schedules the next one", () => {
  const next = nextCadence(cadence, entry);
  assert.equal(next.lastTurn, 276);
  assert.equal(next.lastTag, entry.tag);
  assert.equal(next.nextDueTurn, 301);
  assert.equal(next.intervalTurns, 25);
  assert.equal(next.history.at(-1).turn, 276);
  assert.equal(next.history.at(-1).apkBytes, entry.apkBytes);
  assert.equal(next.history.at(-1).url, entry.url);
  assert.equal(next.history.at(-1).signing, entry.signing);
  assert.equal(cadence.history.length, 2, "the input must not be mutated");
});

test("refuses a release turn that is not after the recorded turn", () => {
  assert.throws(
    () => nextCadence(cadence, { ...entry, turn: 251 }),
    /release turn 251 is not after the recorded turn 251/,
  );
  assert.throws(
    () => nextCadence(cadence, { ...entry, turn: 250 }),
    /release turn 250 is not after the recorded turn 251/,
  );
});

test("omits url and signing when the caller does not provide them", () => {
  const bare = {
    turn: entry.turn,
    tag: entry.tag,
    commit: entry.commit,
    apkBytes: entry.apkBytes,
    run: entry.run,
  };
  const record = nextCadence(cadence, bare).history.at(-1);
  assert.equal(Object.hasOwn(record, "url"), false);
  assert.equal(Object.hasOwn(record, "signing"), false);
});

test("keeps only the newest twelve history rows, oldest first", () => {
  const full = {
    ...cadence,
    history: Array.from({ length: 12 }, (_, index) => ({
      ...entry,
      turn: 100 + index,
    })),
  };
  const next = nextCadence(full, entry);
  assert.equal(next.history.length, 12);
  assert.equal(next.history[0].turn, 101);
  assert.equal(next.history.at(-1).turn, 276);
});

test("refuses a cadence without usable numbers or a version tag", () => {
  assert.throws(
    () => nextCadence({ ...cadence, lastTurn: 0 }, entry),
    /lastTurn/,
  );
  assert.throws(
    () => nextCadence({ ...cadence, intervalTurns: "soon" }, entry),
    /intervalTurns/,
  );
  assert.throws(
    () => nextCadence({ ...cadence, lastTag: "latest" }, entry),
    /lastTag/,
  );
});

test("refuses an incomplete history entry, naming the field", () => {
  for (const field of ["turn", "commit", "apkBytes", "run"]) {
    assert.throws(
      () => nextCadence(cadence, { ...entry, [field]: 0 }),
      new RegExp(field),
    );
  }
  assert.throws(
    () => nextCadence(cadence, { ...entry, tag: "preview" }),
    /tag/,
  );
  assert.throws(() => nextCadence(cadence, undefined), /turn/);
});

test("formats the cadence as stable two-space JSON with a trailing newline", () => {
  const text = formatCadence(nextCadence(cadence, entry));
  assert.ok(text.endsWith("}\n"));
  assert.match(text, /\n {2}"lastTurn": 276,/);
  assert.equal(formatCadence(JSON.parse(text)), text);
});

test("the CLI writes the file and prints one summary line", () => {
  const dir = mkdtempSync(join(tmpdir(), "cadence-write-"));
  const file = join(dir, "cadence.json");
  writeFileSync(file, formatCadence(cadence));
  const output = execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL("./release-cadence-write.mjs", import.meta.url)),
      "--turn",
      "276",
      "--tag",
      entry.tag,
      "--commit",
      entry.commit,
      "--apk-bytes",
      String(entry.apkBytes),
      "--run",
      String(entry.run),
      "--url",
      entry.url,
      "--signing",
      entry.signing,
      "--file",
      file,
    ],
    { encoding: "utf8" },
  );
  assert.match(
    output,
    /^cadence turn 276 -> tag v0\.1\.0-preview\.20261111\.1, next due 301\n$/,
  );
  const written = JSON.parse(readFileSync(file, "utf8"));
  assert.equal(written.lastTurn, 276);
  assert.equal(written.history.at(-1).commit, entry.commit);
  assert.equal(written.history.at(-1).url, entry.url);
  assert.equal(written.history.at(-1).signing, entry.signing);
});

test("the CLI exits non-zero when a required field is missing", () => {
  assert.throws(
    () =>
      execFileSync(
        process.execPath,
        [
          fileURLToPath(
            new URL("./release-cadence-write.mjs", import.meta.url),
          ),
          "--turn",
          "276",
        ],
        { encoding: "utf8", stdio: "pipe" },
      ),
    /missing --tag/,
  );
});
