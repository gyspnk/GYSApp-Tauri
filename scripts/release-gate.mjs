#!/usr/bin/env node
// Release cadence gate: a release is due every `intervalTurns` rounds. The
// cadence file is written by hand after each release, so nothing used to notice
// an early or forgotten dispatch. This script turns that record into a check.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CADENCE_PATH = ".github/release-cadence.json";

/**
 * Decide whether a release may run for `turn`.
 * Returns `{ ok, reason }`; `ok` is true when no turn is given, because a manual
 * dispatch without a turn number is still a legitimate override.
 */
export function checkCadence(cadence, turn) {
  if (turn === null || turn === undefined || turn === "") {
    return { ok: true, reason: "no turn given; cadence not checked" };
  }
  const value = Number(turn);
  if (!Number.isInteger(value) || value < 0) {
    return { ok: false, reason: `turn must be a whole number, got ${turn}` };
  }
  const due = Number(cadence?.nextDueTurn);
  if (!Number.isInteger(due) || due <= 0) {
    return { ok: false, reason: "cadence file has no usable nextDueTurn" };
  }
  if (value < due) {
    return {
      ok: false,
      reason: `turn ${value} is before the due turn ${due}; pass --force to release early`,
    };
  }
  return {
    ok: true,
    reason: `turn ${value} is at or past the due turn ${due}`,
  };
}

/** The changelog base is the cadence tag, so a re-listed commit cannot repeat. */
export function cadenceBase(cadence) {
  const tag =
    typeof cadence?.lastTag === "string" ? cadence.lastTag.trim() : "";
  return /^v[0-9]/.test(tag) ? tag : "";
}

function main(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [flag, inline] = token.slice(2).split("=");
    if (flag === "force" || flag === "base") {
      args[flag] = true;
      continue;
    }
    args[flag] = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
  }
  const cadence = JSON.parse(readFileSync(CADENCE_PATH, "utf8"));
  if (args.base) {
    // Shell-friendly: the workflow reads this instead of guessing from the
    // newest release, which once picked the wrong commit range.
    const base = cadenceBase(cadence);
    if (base) console.log(base);
    return;
  }
  const check = checkCadence(cadence, args.turn);
  if (!check.ok && !args.force) {
    console.error(`release gate: ${check.reason}`);
    process.exit(1);
  }
  if (!check.ok && args.force) {
    console.warn(`release gate: forcing past "${check.reason}"`);
  }
  const base = cadenceBase(cadence);
  if (base) console.log(`release gate: changelog base ${base}`);
  console.log(`release gate: ${check.reason}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
