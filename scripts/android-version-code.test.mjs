import test from "node:test";
import assert from "node:assert/strict";
import { applyVersionCode, codeForTurn } from "./android-version-code.mjs";

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
