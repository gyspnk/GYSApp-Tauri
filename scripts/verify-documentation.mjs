import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const required = {
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
  "CHANGELOG.md": ["# Changelog", "## Unreleased — GA hardening slice"],
  "docs/maintenance/codebase-map.md": [
    "# Codebase simplification map",
    "## Documentation and skill cadence",
    "Last maintenance skill review:",
    "Skill review frontier:",
    "## Decisions so far",
    "## Frontier",
    "## Not yet specified",
  ],
};

function utcDay(value) {
  const date = value instanceof Date ? value : new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? Number.NaN
    : Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function verifyCadence(map, today, failures) {
  const reviewed = map.match(
    /^- Last maintenance skill review: (\d{4}-\d{2}-\d{2})$/m,
  );
  const reviewDay = reviewed && utcDay(reviewed[1]);
  const todayDay = utcDay(today);
  if (!reviewed || Number.isNaN(reviewDay)) {
    failures.push(
      "docs/maintenance/codebase-map.md: missing a valid maintenance skill review date",
    );
  } else if (Number.isNaN(todayDay)) {
    failures.push("documentation: invalid verification date");
  } else if (todayDay - reviewDay >= 30 * 86400000) {
    failures.push(
      `docs/maintenance/codebase-map.md: skill review is overdue (${Math.floor((todayDay - reviewDay) / 86400000)} days old)`,
    );
  }

  const anchor = map.match(/^- Skill review frontier: CF-(\d+)$/m);
  if (!anchor) {
    failures.push(
      "docs/maintenance/codebase-map.md: missing the skill review frontier",
    );
    return;
  }
  const reviewedFrontier = Number(anchor[1]);
  const currentFrontiers = [
    ...map.matchAll(/^- `\d{4}-\d{2}-\d{2} \/ CF-(\d+)`:/gm),
  ].map((match) => Number(match[1]));
  const newFrontiers = currentFrontiers.filter(
    (frontier) => frontier > reviewedFrontier,
  ).length;
  if (newFrontiers >= 10) {
    failures.push(
      `docs/maintenance/codebase-map.md: skill review is overdue after ${newFrontiers} new frontier decisions`,
    );
  }

  const latestFrontier = Math.max(...currentFrontiers);
  if (!new RegExp(`^Validation for CF-0*${latestFrontier}:`, "m").test(map)) {
    failures.push(
      `docs/maintenance/codebase-map.md: missing validation for CF-${latestFrontier}`,
    );
  }
}

export async function verifyDocumentation(
  root = process.cwd(),
  { today = new Date() } = {},
) {
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

  try {
    const map = await readFile(
      resolve(root, "docs/maintenance/codebase-map.md"),
      "utf8",
    );
    verifyCadence(map, today, failures);
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
