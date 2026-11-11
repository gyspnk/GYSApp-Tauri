#!/usr/bin/env node
// Release preflight: one read-only command that checks every pre-dispatch
// condition and names the real value when something does not line up.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { androidApkName, readNativeVersion } from "./release-asset-name.mjs";
import {
  CADENCE_PATH,
  cadenceBase,
  checkCadence,
  dueTurn,
} from "./release-gate.mjs";

export const NATIVE_CONFIG = "apps/native/src-tauri/tauri.conf.json";
export const RELEASE_WORKFLOW = ".github/workflows/android-release.yml";
export const ANDROID_WORKFLOW = ".github/workflows/native-android.yml";
export const RUNTIME_WORKFLOW = ".github/workflows/android-runtime.yml";
export const WORKFLOWS = [RELEASE_WORKFLOW, ANDROID_WORKFLOW, RUNTIME_WORKFLOW];
export const REQUIRED_ASSETS = [
  "SHA256SUMS-android.txt",
  "native-provenance-android.json",
];

const DERIVE = "release-asset-name.mjs --config";

/** Normalizes whitespace so a wrapped shell command still matches. */
function flat(text) {
  return String(text).replace(/\s+/g, " ");
}

/** Turns a shell-style `*` glob into a regular expression. */
function globToRegExp(glob) {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}

/**
 * Reads the version from `tauri.conf.json` and checks that every workflow
 * derives the asset name from that same file instead of another config.
 */
export function checkConfigVersion(configText, workflows) {
  const version = readNativeVersion(configText);
  for (const [file, text] of Object.entries(workflows)) {
    for (const match of String(text).matchAll(
      /release-asset-name\.mjs\s+--config\s+([^\s)\"']+)/g,
    )) {
      if (match[1] !== NATIVE_CONFIG) {
        throw new Error(
          `${file} derives the APK name from ${match[1]}, expected ${NATIVE_CONFIG}`,
        );
      }
    }
  }
  return version;
}

/**
 * Checks the derived APK name against the three workflows: the builders must
 * derive it, and the runtime glob must still match it.
 */
export function checkAssetName(version, workflows) {
  const name = androidApkName(version);
  const problems = [];
  for (const file of [RELEASE_WORKFLOW, ANDROID_WORKFLOW]) {
    if (!flat(workflows[file] ?? "").includes(`${DERIVE} ${NATIVE_CONFIG}`)) {
      problems.push(`${file} does not derive the name from ${NATIVE_CONFIG}`);
    }
  }
  const runtime = String(workflows[RUNTIME_WORKFLOW] ?? "");
  const glob = runtime.match(/GYSApp-[^'"\s]*\.apk/);
  if (!glob) {
    problems.push(
      `${RUNTIME_WORKFLOW} does not reference a GYSApp-*.apk asset`,
    );
  } else if (!globToRegExp(glob[0]).test(name)) {
    problems.push(
      `${RUNTIME_WORKFLOW} expects ${glob[0]} but the derived name is ${name}`,
    );
  }
  if (problems.length > 0) throw new Error(problems.join("; "));
  return `${name} used by ${WORKFLOWS.length} workflows`;
}

/** Checks the requested turn against the cadence due turn. */
export function checkTurn(cadence, turn) {
  const due = dueTurn(cadence);
  const requested = turn === undefined || turn === "" ? due : Number(turn);
  if (!Number.isInteger(requested) || requested < 0) {
    throw new Error(`turn must be a whole number, got ${turn}`);
  }
  const result = checkCadence(cadence, requested);
  if (!result.ok) throw new Error(result.reason);
  return `turn ${requested} passes; due turn ${due}`;
}

/** Checks that the changelog base is the cadence `lastTag` and resolves. */
export function checkChangelogBase(cadence, revParse) {
  const tag = cadenceBase(cadence);
  const lastTag =
    typeof cadence?.lastTag === "string" ? cadence.lastTag.trim() : "";
  if (!tag) {
    throw new Error(
      `cadence lastTag ${JSON.stringify(cadence?.lastTag ?? null)} is not a release tag`,
    );
  }
  if (lastTag !== tag) {
    throw new Error(`changelog base ${tag} is not cadence lastTag ${lastTag}`);
  }
  let sha;
  try {
    sha = String(revParse(tag)).trim();
  } catch {
    throw new Error(`changelog base ${tag} is not a tag in this checkout`);
  }
  if (!sha)
    throw new Error(`changelog base ${tag} did not resolve to a commit`);
  return `${tag} at ${sha.slice(0, 12)}`;
}

/** Checks that the release workflow verifies both required assets. */
export function checkReleaseAssets(releaseWorkflow) {
  const missing = REQUIRED_ASSETS.filter(
    (name) => !String(releaseWorkflow).includes(name),
  );
  if (missing.length > 0) {
    throw new Error(
      `${RELEASE_WORKFLOW} does not attach ${missing.join(", ")}`,
    );
  }
  return REQUIRED_ASSETS.join(", ");
}

/** Runs every check against the checkout rooted at `root`. */
export function preflight({ root = process.cwd(), turn } = {}) {
  const read = (file) => readFileSync(join(root, file), "utf8");
  const workflows = Object.fromEntries(
    WORKFLOWS.map((file) => [file, read(file)]),
  );
  const cadence = JSON.parse(read(CADENCE_PATH));
  const revParse = (tag) =>
    execFileSync("git", ["rev-parse", "--verify", `${tag}^{commit}`], {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });

  const checks = [];
  const run = (label, fn) => {
    try {
      checks.push({ label, ok: true, detail: fn() });
    } catch (error) {
      checks.push({
        label,
        ok: false,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  };

  let version = "";
  run("version", () => {
    version = checkConfigVersion(read(NATIVE_CONFIG), workflows);
    return `${version} from ${NATIVE_CONFIG}`;
  });
  run("asset name", () => {
    if (!version) {
      throw new Error(
        `no version from ${NATIVE_CONFIG}; cannot derive the name`,
      );
    }
    return checkAssetName(version, workflows);
  });
  run("cadence", () => checkTurn(cadence, turn));
  run("changelog base", () => checkChangelogBase(cadence, revParse));
  run("release assets", () => checkReleaseAssets(workflows[RELEASE_WORKFLOW]));
  return { checks, ok: checks.every((check) => check.ok) };
}

function parseTurn(argv) {
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--turn") return argv[index + 1];
    if (argv[index].startsWith("--turn=")) return argv[index].slice(7);
  }
  return undefined;
}

function main() {
  const turn = parseTurn(process.argv.slice(2));
  if (turn !== undefined && !/^\d+$/.test(turn)) {
    process.stderr.write(
      `release-preflight: turn must be a whole number, got ${turn}\n`,
    );
    process.exitCode = 1;
    return;
  }
  const { checks, ok } = preflight({ turn });
  const width = Math.max(...checks.map((check) => check.label.length));
  for (const check of checks) {
    console.log(
      `${check.ok ? "ok  " : "FAIL"} ${check.label.padEnd(width)}  ${check.detail}`,
    );
  }
  const failed = checks.filter((check) => !check.ok).length;
  console.log(
    ok
      ? `release preflight: OK (${checks.length} checks)`
      : `release preflight: FAILED (${failed} of ${checks.length} checks)`,
  );
  process.exitCode = ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `release-preflight: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
