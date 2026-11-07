#!/usr/bin/env node
/**
 * Refuses to start heavy work on the development device.
 *
 * Owner instruction (7 Nov): every development process — typecheck, unit
 * tests, build, browser/e2e, visual, axe, benchmarks, native soak, bundle and
 * docs verification — runs in GitHub Actions. The device only serves the site
 * locally (Vite dev on 5173, preview on 4173).
 *
 * Continuous integration sets `CI=true`, so the same scripts keep running
 * unchanged inside workflow jobs. A deliberate local run stays possible with
 * `GYS_ALLOW_LOCAL_HEAVY=1` for the rare case the owner asks for it by name.
 */
const label = process.argv[2] ?? "This command";

if (process.env.GYS_ALLOW_LOCAL_HEAVY === "1") process.exit(0);
if (process.env.CI === "true") process.exit(0);

console.error(
  [
    "",
    `✋ ${label} belongs to GitHub Actions, not to this device.`,
    "",
    "Owner policy (7 Nov): only the local web server runs here.",
    "  • see what Actions will run for HEAD:  pnpm verify",
    "  • wait for that run:                    pnpm verify --wait",
    "  • request the screenshot/audit matrix:  pnpm verify:qa",
    "  • open the running jobs:                gh run list --workflow ci.yml --limit 3",
    "",
    "Local servers only:  pnpm dev   (5173)   pnpm preview   (4173)",
    "Deliberate one-off local run: prepend GYS_ALLOW_LOCAL_HEAVY=1",
    "",
  ].join("\n"),
);
process.exit(1);
