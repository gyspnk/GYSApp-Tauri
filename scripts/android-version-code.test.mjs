import test from "node:test";
import assert from "node:assert/strict";
import {
  applyConfigVersionCode,
  applyVersionCode,
  codeForTurn,
} from "./android-version-code.mjs";

const PROPERTIES = 'tauri.android.versionCode=1\nversionName="0.1.0"\n';

test("a release turn maps to a version code that always grows", () => {
  assert.equal(codeForTurn(251), 1251);
  assert.ok(codeForTurn(276) > codeForTurn(251));
  assert.throws(() => codeForTurn(0), /positive integer/);
  assert.throws(() => codeForTurn(1.5), /positive integer/);
});

test("the version code is written into the properties", () => {
  const { text, previous } = applyVersionCode(PROPERTIES, 1276);
  assert.equal(previous, 1);
  assert.match(text, /^tauri.android.versionCode=1276$/m);
  assert.match(text, /^versionName="0\.1\.0"$/m);
});

test("a properties file without a version code is refused", () => {
  assert.throws(
    () => applyVersionCode('versionName="0.1.0"\n', 1276),
    /no versionCode line/,
  );
});

test("a code that would go backwards is refused", () => {
  assert.throws(
    () => applyVersionCode("tauri.android.versionCode=1300\n", 1276),
    /must only grow/,
  );
});

test("an older bare key is rewritten without renaming it", () => {
  const { text } = applyVersionCode("versionCode=7\n", 1276);
  assert.match(text, /^versionCode=1276$/m);
});

test("writes the code into tauri.conf.json before the project is generated", () => {
  const before = JSON.stringify(
    { productName: "GYSApp", version: "0.1.0", bundle: { android: {} } },
    null,
    2,
  );
  const { text, previous } = applyConfigVersionCode(before, 1276);
  assert.equal(previous, undefined);
  const after = JSON.parse(text);
  assert.equal(after.bundle.android.versionCode, 1276);
  assert.equal(after.version, "0.1.0");
  // The edit stays textual: only the android block changes, no array is reflowed.
  assert.match(text, /"android": \{ "versionCode": 1276 \}/);
  assert.equal(text.split("\n").length, before.split("\n").length);
});

test("refuses to lower a code already written in the config", () => {
  const before = JSON.stringify({ bundle: { android: { versionCode: 1300 } } });
  assert.throws(() => applyConfigVersionCode(before, 1276), /must only grow/);
});

test("adds the android block when the config has none", () => {
  const before = `${JSON.stringify(
    {
      productName: "GYSApp",
      version: "0.1.0",
      bundle: { active: true, icon: ["icons/icon.ico"] },
    },
    null,
    2,
  )}\n`;
  const { text } = applyConfigVersionCode(before, 1276);
  const after = JSON.parse(text);
  assert.equal(after.bundle.android.versionCode, 1276);
  assert.deepEqual(after.bundle.icon, ["icons/icon.ico"]);
  assert.equal(text.split("\n").length, before.split("\n").length + 1);
});
