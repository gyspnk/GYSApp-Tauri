#!/usr/bin/env node
// The cadence rule is "a release every 25 rounds", but nothing counted rounds:
// the number was supplied by hand at dispatch time, so a busy stretch could run
// far past the due turn without anyone noticing. Rounds end in commits, so the
// commit count since the last release tag is the durable witness. This script
// answers whether a release is due, for the scheduled workflow and for humans.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CADENCE_PATH = ".github/release-cadence.json";

/** Count commits reachable from `head` but not from `tag`; null when unknown. */
export function commitsSince(tag, head = "HEAD", git = execFileSync) {
  if (typeof tag !== "string" || !/^v[0-9]/.test(tag.trim())) return null;
  try {
    const out = git("git", ["rev-list", "--count", `${tag.trim()}..${head}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const count = Number(String(out).trim());
    return Number.isInteger(count) ? count : null;
  } catch {
    return null;
  }
}

/**
 * Decide the scheduled release. `due` is true when the commits since the last
 * release tag reach the interval, or when the recorded turn already passed.
 */
export function cadenceDue(cadence, commits) {
  const interval = Number(cadence?.intervalTurns);
  const dueTurn = Number(cadence?.nextDueTurn);
  if (!Number.isInteger(interval) || interval <= 0) {
    return { due: false, reason: "cadence file has no usable intervalTurns" };
  }
  if (!Number.isInteger(dueTurn) || dueTurn <= 0) {
    return { due: false, reason: "cadence file has no usable nextDueTurn" };
  }
  if (!Number.isInteger(commits) || commits < 0) {
    // Without a count the cadence's own due turn is the only number to trust;
    // dispatching with an undefined turn would be rejected by the release gate.
    return {
      due: true,
      turn: dueTurn,
      reason: "commit count unknown; releasing is safer",
    };
  }
  if (commits >= interval) {
    return {
      due: true,
      turn: dueTurn,
      reason: `${commits} commits since ${cadence.lastTag} reach the interval ${interval}`,
    };
  }
  return {
    due: false,
    reason: `${commits} of ${interval} commits since ${cadence.lastTag}`,
  };
}

function main(argv) {
  const cadence = JSON.parse(readFileSync(CADENCE_PATH, "utf8"));
  const commits = commitsSince(cadence?.lastTag);
  const decision = cadenceDue(cadence, commits);
  const quiet = argv.includes("--quiet");
  if (!quiet) {
    const summary = decision.due ? "due" : "wait";
    console.log(
      `${summary}: ${decision.reason}${decision.due ? `; release turn ${decision.turn}` : ""}`,
    );
  }
  // Shell-friendly: `--turn` prints the turn to dispatch, nothing when waiting.
  if (argv.includes("--turn")) {
    if (decision.due) console.log(decision.turn);
    return;
  }
  // 0 = release now, 2 = wait for more rounds, 1 = the decision itself broke.
  // The workflow reads 2 as "nothing to do", so a waiting cron run stays green.
  process.exitCode = decision.due ? 0 : 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv.slice(2));
