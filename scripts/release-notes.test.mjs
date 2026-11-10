import assert from "node:assert/strict";
import test from "node:test";
import {
  buildChangelog,
  groupCommits,
  nextTag,
  parseCommits,
} from "./release-notes.mjs";

test("parses conventional commits and keeps unknown subjects", () => {
  const commits = parseCommits(
    [
      "abc1234\tfeat(kidung): add queue",
      "def5678\tfix: stop flicker",
      "0123456\tUpdate docs",
    ].join("\n"),
  );
  assert.deepEqual(
    commits.map((commit) => [commit.type, commit.description]),
    [
      ["feat", "add queue"],
      ["fix", "stop flicker"],
      ["other", "Update docs"],
    ],
  );
});

test("groups commits in the documented order", () => {
  const groups = groupCommits(
    parseCommits(
      ["a\tchore: x", "b\tfeat: y", "c\tfix: z", "d\tperf: w"].join("\n"),
    ),
  );
  assert.deepEqual(
    groups.map((group) => group.type),
    ["feat", "fix", "perf", "chore"],
  );
});

test("builds a changelog with counts, capped lists, and artifact notes", () => {
  const commits = Array.from(
    { length: 30 },
    (_, index) => `h${index}\tfix: perbaikan ${index}`,
  ).join("\n");
  const { notes, counts } = buildChangelog(parseCommits(commits), {
    tag: "v0.1.0-preview.20261110.1",
    date: "2026-11-10",
    limitPerGroup: 2,
  });
  assert.equal(counts.fix, 30);
  assert.match(notes, /# v0\.1\.0-preview\.20261110\.1/);
  assert.match(notes, /Total 30 perubahan: 30 perbaikan\./);
  assert.match(notes, /…dan 28 perubahan lain\./);
  assert.match(notes, /GYSApp-0\.1\.0-android-arm64-preview\.apk/);
});

test("picks the next tag for the day", () => {
  assert.equal(nextTag("2026-11-10", []), "v0.1.0-preview.20261110.1");
  assert.equal(
    nextTag("2026-11-10", [
      "v0.1.0-preview.20261110.1",
      "v0.1.0-preview.20261110.4",
      "v0.1.0-preview.20261109.9",
    ]),
    "v0.1.0-preview.20261110.5",
  );
  assert.throws(() => nextTag("10-11-2026", []), /Invalid date/);
});
