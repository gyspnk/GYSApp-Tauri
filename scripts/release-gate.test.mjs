import assert from "node:assert/strict";
import test from "node:test";

import { cadenceBase, checkCadence } from "./release-gate.mjs";

const cadence = {
  lastTurn: 251,
  lastTag: "v0.1.0-preview.20261110.2",
  nextDueTurn: 276,
};

test("accepts the due turn and every later turn", () => {
  assert.equal(checkCadence(cadence, 276).ok, true);
  assert.equal(checkCadence(cadence, 301).ok, true);
});

test("refuses a turn before the due turn, naming both numbers", () => {
  const result = checkCadence(cadence, 262);
  assert.equal(result.ok, false);
  assert.match(result.reason, /turn 262/);
  assert.match(result.reason, /276/);
});

test("refuses a cadence file that cannot say when the release is due", () => {
  assert.equal(checkCadence({}, 276).ok, false);
  assert.equal(checkCadence({ nextDueTurn: "soon" }, 276).ok, false);
});

test("skips the check when no turn was given, so manual dispatch still works", () => {
  assert.equal(checkCadence(cadence, "").ok, true);
  assert.equal(checkCadence(cadence, undefined).ok, true);
});

test("only a version-shaped lastTag becomes the changelog base", () => {
  assert.equal(cadenceBase(cadence), "v0.1.0-preview.20261110.2");
  assert.equal(cadenceBase({ lastTag: "latest" }), "");
  assert.equal(cadenceBase({}), "");
});
