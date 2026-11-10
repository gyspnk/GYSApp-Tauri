#!/usr/bin/env node
/**
 * Refuses to start heavy work on the development device.
 *
 * Owner instruction (7 Nov) ran every development process in GitHub Actions.
 * Owner update (10 Nov, creator mode): a local run is allowed when it is
 * faster than the hosted round and the device can take it, so `check:fast`
 * (Prettier + web typecheck + the touched unit files) is the local default.
 * Everything heavier — full suites, browser contracts, visual, axe, perf,
 * build, soak, bundle — still belongs to Actions.
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
    "Owner policy (10 Nov): local runs are fine when they are the fast path.",
    "Fast local check:  pnpm check:fast     (format + typecheck + touched units)",
    "  • see what Actions will run for HEAD:  pnpm verify",
    "  • wait for that run:                    pnpm verify --wait",
    "  • request the screenshot/audit matrix:  pnpm verify:qa",
    "  • open the running jobs:                gh run list --workflow ci.yml --limit 3",
    "",
    "Local servers only:  pnpm dev   (5173)   pnpm preview   (4173)",
    "A heavier local run: prepend GYS_ALLOW_LOCAL_HEAVY=1 (watch the device)",
    "",
  ].join("\n"),
);
process.exit(1);
