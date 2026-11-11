#!/usr/bin/env node
// Android refuses to install an APK whose versionCode is not greater than the
// installed one, so every preview needs a code that only grows. The release turn
// is already monotonic, which makes it the honest source for the code.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const BASE = 1000;

export function codeForTurn(turn) {
  if (!Number.isInteger(turn) || turn <= 0) {
    throw new Error(`release turn must be a positive integer, got ${turn}`);
  }
  return BASE + turn;
}

export function applyVersionCode(text, code) {
  if (!Number.isInteger(code) || code <= 0) {
    throw new Error(`version code must be a positive integer, got ${code}`);
  }
  // Tauri writes `tauri.android.versionCode=1`; older generated files used the
  // bare `versionCode=1`. Match the real key and keep it, so Gradle keeps reading
  // the property it asks for (`getProperty("tauri.android.versionCode", "1")`).
  const pattern = /^(tauri\.android\.)?versionCode=(\d+)$/m;
  const match = pattern.exec(text);
  if (!match) {
    throw new Error("tauri.properties has no versionCode line to raise");
  }
  const key = match[1] ?? "";
  if (Number(match[2]) > code) {
    throw new Error(
      `the properties already say ${key}versionCode=${match[2]}, above ${code}; the code must only grow`,
    );
  }
  return {
    text: text.replace(pattern, `${key}versionCode=${code}`),
    previous: Number(match[2]),
  };
}

function main(argv) {
  const path = argv.find((arg) => !arg.startsWith("--") && !/^\d+$/.test(arg));
  const turnIndex = argv.indexOf("--turn");
  if (!path || turnIndex === -1) {
    console.error(
      "usage: android-version-code.mjs --turn <n> <tauri.properties>",
    );
    return 2;
  }
  const code = codeForTurn(Number(argv[turnIndex + 1]));
  const before = readFileSync(path, "utf8");
  const { text, previous } = applyVersionCode(before, code);
  writeFileSync(path, text);
  console.log(
    `versionCode ${previous} -> ${code} (release turn ${code - BASE})`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
