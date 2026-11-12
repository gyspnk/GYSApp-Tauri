#!/usr/bin/env node
// Android refuses to install an APK whose versionCode is not greater than the
// installed one, so every preview needs a code that only grows. The release turn
// is already monotonic, which makes it the honest source for the code.
import { readFileSync, writeFileSync } from "node:fs";
import { extname } from "node:path";
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

// Tauri 2.11 stopped writing `tauri.properties` for a project generated with an
// empty `bundle.android` block, so the code has to be set where the generator
// reads it: `bundle.android.versionCode` in tauri.conf.json, before `android init`.
// The edit is textual on purpose: re-serialising the whole config would rewrite
// every array in the file and bury the one line that changed.
export function applyConfigVersionCode(text, code) {
  if (!Number.isInteger(code) || code <= 0) {
    throw new Error(`version code must be a positive integer, got ${code}`);
  }
  const config = JSON.parse(text);
  const previous = config.bundle?.android?.versionCode;
  if (Number.isInteger(previous) && previous > code) {
    throw new Error(
      `tauri.conf.json already says bundle.android.versionCode=${previous}, above ${code}; the code must only grow`,
    );
  }
  const bundleAt = text.search(/"bundle"\s*:\s*\{/);
  if (bundleAt === -1) {
    throw new Error('tauri.conf.json has no "bundle" object');
  }
  const open = text.indexOf("{", bundleAt);
  const close = matchingBrace(text, open);
  const body = text.slice(open + 1, close);
  const androidAt = body.search(/"android"\s*:\s*\{/);
  let nextBody;
  if (androidAt === -1) {
    nextBody = `\n    "android": { "versionCode": ${code} },${body}`;
  } else {
    const androidOpen = body.indexOf("{", androidAt);
    const androidClose = matchingBrace(body, androidOpen);
    const inner = body.slice(androidOpen + 1, androidClose);
    const existing = /"versionCode"\s*:\s*\d+/;
    const nextInner = existing.test(inner)
      ? inner.replace(existing, `"versionCode": ${code}`)
      : `${inner.replace(/\s*$/, "")}${inner.trim() ? "," : ""} "versionCode": ${code} `;
    nextBody =
      body.slice(0, androidOpen + 1) + nextInner + body.slice(androidClose);
  }
  return {
    text: text.slice(0, open + 1) + nextBody + text.slice(close),
    previous,
  };
}

// Brace matching that ignores braces inside strings, so a value like
// `"csp": "default-src 'self'"` cannot end the object early.
function matchingBrace(text, open) {
  let depth = 0;
  let inString = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (char === "\\") index += 1;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error("tauri.conf.json has an unbalanced object");
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
  const isConfig = extname(path) === ".json";
  const { text, previous } = isConfig
    ? applyConfigVersionCode(before, code)
    : applyVersionCode(before, code);
  writeFileSync(path, text);
  console.log(
    `versionCode ${previous ?? "unset"} -> ${code} (release turn ${code - BASE}) in ${path}`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
