import assert from "node:assert/strict";
import test from "node:test";

import { cadenceDue, commitsSince } from "./release-due.mjs";

const cadence = {
  intervalTurns: 25,
  lastTurn: 276,
  lastTag: "v0.1.0-preview.20261112.1",
  nextDueTurn: 301,
};

test("releases once the commits since the last tag reach the interval", () => {
  const decision = cadenceDue(cadence, 25);
  assert.equal(decision.due, true);
  assert.equal(decision.turn, 301);
  assert.match(decision.reason, /25 commits/);
});

test("waits while fewer commits than the interval have landed", () => {
  const decision = cadenceDue(cadence, 24);
  assert.equal(decision.due, false);
  assert.match(decision.reason, /24 of 25/);
});

test("releases when the commit count cannot be read, rather than skipping it", () => {
  assert.equal(cadenceDue(cadence, null).due, true);
  assert.equal(cadenceDue(cadence, undefined).due, true);
  // An unknown count still needs a turn: the release gate rejects a blank one.
  assert.equal(cadenceDue(cadence, null).turn, cadence.nextDueTurn);
});

test("refuses a cadence file that cannot say when the release is due", () => {
  assert.equal(cadenceDue({}, 40).due, false);
  assert.equal(cadenceDue({ intervalTurns: 25 }, 40).due, false);
});

test("counts commits only for a release tag, not for a branch name", () => {
  let called = false;
  const git = () => {
    called = true;
    return "7\n";
  };
  assert.equal(commitsSince("main", "HEAD", git), null);
  assert.equal(called, false);
  assert.equal(commitsSince("v0.1.0-preview.20261112.1", "HEAD", git), 7);
});

test("returns null when git cannot answer", () => {
  const git = () => {
    throw new Error("bad revision");
  };
  assert.equal(commitsSince("v0.1.0-preview.20261112.1", "HEAD", git), null);
});
