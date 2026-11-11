#!/usr/bin/env node
// Single source of truth for the Android preview APK asset name.
//
// Usage:
//   node scripts/release-asset-name.mjs --version 0.1.0
//   node scripts/release-asset-name.mjs --config apps/native/src-tauri/tauri.conf.json
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

/** Builds the version-derived APK asset name. */
export function androidApkName(version) {
  const value = String(version ?? "").trim();
  if (!value) throw new Error("androidApkName: version must not be empty");
  return `GYSApp-${value}-android-arm64-preview.apk`;
}

/** Reads `version` from a tauri.conf.json string; missing field throws. */
export function readNativeVersion(text) {
  let config;
  try {
    config = JSON.parse(String(text));
  } catch (error) {
    throw new Error(
      `readNativeVersion: invalid tauri.conf.json: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const version =
    typeof config?.version === "string" ? config.version.trim() : "";
  if (!version) {
    throw new Error('readNativeVersion: missing "version" in tauri.conf.json');
  }
  return version;
}

function main() {
  const { values } = parseArgs({
    options: {
      version: { type: "string" },
      config: { type: "string" },
    },
  });
  if (values.version !== undefined) {
    process.stdout.write(`${androidApkName(values.version)}\n`);
    return;
  }
  if (values.config !== undefined) {
    const text = readFileSync(values.config, "utf8");
    process.stdout.write(`${androidApkName(readNativeVersion(text))}\n`);
    return;
  }
  throw new Error(
    "Usage: release-asset-name.mjs --version <version> | --config <tauri.conf.json>",
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
