import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const required = {
  "README.md": [
    "## Architecture at a glance",
    "## Feature map",
    "## Development",
    "## Deployment prerequisites",
  ],
  "docs/architecture.md": [
    "## Feature lifecycle diagrams",
    "### Persistent media",
    "### Literature and PDF",
    "### Kidung",
    "### Alkitab and voice",
    "### e-GYS authentication and local contract sync",
    "### Web cache, packaged assets, and release workflow",
    "## Release gates",
  ],
  "docs/release-readiness.md": [
    "# Release readiness ledger",
    "## Current evidence",
    "Axe runs on the Home and Kidung surfaces",
    "GitHub Pages now builds",
  ],
  "PROGRESS.md": [
    "## Done & Verified",
    "## Implemented / Needs Verification",
    "## Next controlled work",
    "42 passing flows",
  ],
  "CHANGELOG.md": ["# Changelog", "## Unreleased — GA hardening slice"],
};

export async function verifyDocumentation(root = process.cwd()) {
  const failures = [];
  for (const [relative, fragments] of Object.entries(required)) {
    const path = resolve(root, relative);
    let text;
    try {
      text = await readFile(path, "utf8");
    } catch {
      failures.push(`${relative}: file is missing`);
      continue;
    }
    for (const fragment of fragments) {
      if (!text.includes(fragment))
        failures.push(`${relative}: missing "${fragment}"`);
    }
  }

  try {
    const readme = await readFile(resolve(root, "README.md"), "utf8");
    const architecture = await readFile(
      resolve(root, "docs/architecture.md"),
      "utf8",
    );
    if ((readme.match(/```mermaid/g) ?? []).length < 2)
      failures.push("README.md: expected at least two Mermaid diagrams");
    if ((architecture.match(/```mermaid/g) ?? []).length < 10)
      failures.push("docs/architecture.md: expected lifecycle diagrams");
  } catch {
    // Missing-file failures are already reported above.
  }
  return failures;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))
) {
  const failures = await verifyDocumentation();
  if (failures.length) {
    for (const failure of failures) console.error(`Documentation: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log("Living documentation verified.");
  }
}
