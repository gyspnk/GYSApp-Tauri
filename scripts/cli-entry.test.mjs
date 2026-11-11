import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "node:test";

// Every helper must be importable: `node --input-type=module -e "await import(…)"`
// leaves argv[1] undefined, and an unguarded pathToFileURL(undefined) throws before
// a single line of the module runs. That broke the versionCode check in CI once.
const SCRIPTS = [
  "android-version-code.mjs",
  "dead-css.mjs",
  "e2e-one.mjs",
  "fast-check.mjs",
  "orphan-selectors.mjs",
  "prune-dead-css.mjs",
  "release-asset-name.mjs",
  "release-cadence-write.mjs",
  "release-gate.mjs",
  "release-notes.mjs",
];

const root = fileURLToPath(new URL("../scripts/", import.meta.url));

for (const name of SCRIPTS) {
  test(`${name} imports without a CLI entry`, () => {
    const url = pathToFileURL(`${root}${name}`).href;
    const out = execFileSync(
      process.execPath,
      ["--input-type=module", "-e", `await import(${JSON.stringify(url)});`],
      { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
    );
    assert.equal(out.trim(), "");
  });
}
