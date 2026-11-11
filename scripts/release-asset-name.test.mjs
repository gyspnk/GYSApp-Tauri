import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { androidApkName, readNativeVersion } from "./release-asset-name.mjs";

const helper = fileURLToPath(
  new URL("./release-asset-name.mjs", import.meta.url),
);
const config = fileURLToPath(
  new URL("../apps/native/src-tauri/tauri.conf.json", import.meta.url),
);

test("builds the APK name from the version", () => {
  assert.equal(
    androidApkName("0.1.0"),
    "GYSApp-0.1.0-android-arm64-preview.apk",
  );
});

test("rejects an empty or whitespace-only version", () => {
  assert.throws(() => androidApkName(""), /version must not be empty/);
  assert.throws(() => androidApkName("   "), /version must not be empty/);
  assert.throws(() => androidApkName(undefined), /version must not be empty/);
});

test("reads the version from a tauri.conf.json string", () => {
  const text = JSON.stringify({ productName: "GYSApp", version: "1.2.3" });
  assert.equal(readNativeVersion(text), "1.2.3");
});

test("throws when the version field is missing", () => {
  assert.throws(
    () => readNativeVersion(JSON.stringify({ productName: "GYSApp" })),
    /missing "version"/,
  );
  assert.throws(() => readNativeVersion("not json"), /invalid tauri.conf.json/);
});

test("CLI prints the name for --version and for --config", () => {
  const byVersion = spawnSync(
    process.execPath,
    [helper, "--version", "9.9.9"],
    { encoding: "utf8" },
  );
  assert.equal(byVersion.status, 0);
  assert.equal(byVersion.stdout, "GYSApp-9.9.9-android-arm64-preview.apk\n");

  // The checkout path contains a space, so this also covers the CLI guard.
  const byConfig = spawnSync(process.execPath, [helper, "--config", config], {
    encoding: "utf8",
  });
  assert.equal(byConfig.status, 0);
  const expected = androidApkName(
    readNativeVersion(readFileSync(config, "utf8")),
  );
  assert.equal(byConfig.stdout, `${expected}\n`);
});
