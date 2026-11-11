import assert from "node:assert/strict";
import test from "node:test";

import {
  ANDROID_WORKFLOW,
  NATIVE_CONFIG,
  RELEASE_WORKFLOW,
  RUNTIME_WORKFLOW,
  checkAssetName,
  checkChangelogBase,
  checkConfigVersion,
  checkReleaseAssets,
  checkTurn,
} from "./release-preflight.mjs";

const config = JSON.stringify({ version: "0.1.0" });
const derive = `node scripts/release-asset-name.mjs --config ${NATIVE_CONFIG}`;
const workflows = {
  [RELEASE_WORKFLOW]: `apk_name=$(${derive})`,
  [ANDROID_WORKFLOW]: `APK_NAME=$(${derive})`,
  [RUNTIME_WORKFLOW]: `apk=$(find android-artifacts -maxdepth 1 -name 'GYSApp-*-android-arm64-preview.apk' -print -quit)`,
};
const cadence = {
  lastTurn: 251,
  lastTag: "v0.1.0-preview.20261110.2",
  nextDueTurn: 276,
};

test("reads the APK version from tauri.conf.json", () => {
  assert.equal(checkConfigVersion(config, workflows), "0.1.0");
  assert.throws(
    () => checkConfigVersion('{"version":""}', workflows),
    /missing "version"/,
  );
});

test("rejects a workflow that derives the name from another config", () => {
  const other = {
    ...workflows,
    [ANDROID_WORKFLOW]:
      "node scripts/release-asset-name.mjs --config other.json",
  };
  assert.throws(
    () => checkConfigVersion(config, other),
    new RegExp(`${ANDROID_WORKFLOW} derives the APK name from other\\.json`),
  );
});

test("derives the asset name used by the release workflows", () => {
  assert.match(
    checkAssetName("0.1.0", workflows),
    /GYSApp-0\.1\.0-android-arm64-preview\.apk used by 3 workflows/,
  );
});

test("fails when the runtime glob no longer matches the derived name", () => {
  const stale = {
    ...workflows,
    [RUNTIME_WORKFLOW]:
      "apk=$(find android-artifacts -name 'GYSApp-*-arm64.apk')",
  };
  assert.throws(
    () => checkAssetName("0.1.0", stale),
    /GYSApp-\*-arm64\.apk but the derived name is GYSApp-0\.1\.0-android-arm64-preview\.apk/,
  );
});

test("accepts the due turn and rejects an earlier one", () => {
  assert.match(checkTurn(cadence, 276), /turn 276 passes; due turn 276/);
  assert.match(checkTurn(cadence), /turn 276 passes/);
  assert.throws(
    () => checkTurn(cadence, 200),
    /turn 200 is before the due turn 276/,
  );
  assert.throws(() => checkTurn(cadence, "soon"), /whole number, got soon/);
});

test("requires the changelog base to be a tag in the checkout", () => {
  assert.match(
    checkChangelogBase(cadence, () => "abc123def4567890"),
    /v0\.1\.0-preview\.20261110\.2 at abc123def456/,
  );
  assert.throws(
    () =>
      checkChangelogBase(cadence, () => {
        throw new Error("unknown revision");
      }),
    /changelog base v0\.1\.0-preview\.20261110\.2 is not a tag in this checkout/,
  );
  assert.throws(
    () => checkChangelogBase({ lastTag: "latest" }, () => "abc"),
    /lastTag "latest" is not a release tag/,
  );
});

test("requires both release assets to be verified by the release workflow", () => {
  assert.match(
    checkReleaseAssets(
      "for required in SHA256SUMS-android.txt native-provenance-android.json",
    ),
    /SHA256SUMS-android\.txt, native-provenance-android\.json/,
  );
  assert.throws(
    () => checkReleaseAssets("SHA256SUMS-android.txt"),
    /does not attach native-provenance-android\.json/,
  );
});
