#!/usr/bin/env node
// Records one shipped release in the cadence file. The record used to be edited
// by hand after every release, which is how it drifted; the workflow now calls
// this script and the validation refuses an incomplete entry.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const CADENCE_PATH = ".github/release-cadence.json";
export const MAX_HISTORY = 12;

function positiveInteger(value, field) {
  const number =
    typeof value === "number" || typeof value === "string"
      ? Number(value)
      : Number.NaN;
  if (!Number.isInteger(number) || number <= 0) {
    throw new Error(
      `${field} must be a positive whole number, got ${String(value)}`,
    );
  }
  return number;
}

function tagValue(value, field) {
  const tag = typeof value === "string" ? value.trim() : "";
  if (!tag.startsWith("v")) {
    throw new Error(
      `${field} must be a tag starting with "v", got ${String(value)}`,
    );
  }
  return tag;
}

/**
 * Return a new cadence object that records `entry` as the release just shipped.
 * History keeps the newest 12 rows, oldest first.
 */
export function nextCadence(cadence, entry) {
  if (
    cadence === null ||
    typeof cadence !== "object" ||
    Array.isArray(cadence)
  ) {
    throw new Error("cadence must be an object");
  }
  const lastTurn = positiveInteger(cadence.lastTurn, "lastTurn");
  const intervalTurns = positiveInteger(cadence.intervalTurns, "intervalTurns");
  const previousTag = tagValue(cadence.lastTag, "lastTag");
  if (!Array.isArray(cadence.history)) {
    throw new Error("history must be an array");
  }
  const turn = positiveInteger(entry?.turn, "turn");
  if (turn <= lastTurn) {
    throw new Error(
      `release turn ${turn} is not after the recorded turn ${lastTurn}`,
    );
  }
  if (typeof entry?.commit !== "string" || entry.commit.trim() === "") {
    throw new Error(
      `commit must be a non-empty string, got ${String(entry?.commit)}`,
    );
  }
  const apkBytes = positiveInteger(entry?.apkBytes, "apkBytes");
  const run = positiveInteger(entry?.run, "run");
  const tag =
    entry?.tag === undefined ? previousTag : tagValue(entry.tag, "tag");
  const record = { turn, tag, commit: entry.commit.trim(), apkBytes, run };
  if (typeof entry.url === "string" && entry.url !== "") {
    record.url = entry.url;
  }
  if (typeof entry.signing === "string" && entry.signing !== "") {
    record.signing = entry.signing;
  }
  return {
    ...cadence,
    lastTurn: turn,
    lastTag: tag,
    nextDueTurn: turn + intervalTurns,
    history: [...cadence.history, record].slice(-MAX_HISTORY),
  };
}

/** Serialise the cadence file: two-space JSON and exactly one trailing newline. */
export function formatCadence(cadence) {
  return `${JSON.stringify(cadence, null, 2)}\n`;
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const [flag, inline] = token.slice(2).split("=");
    args[flag] = inline ?? argv[index + 1];
    if (inline === undefined) index += 1;
  }
  return args;
}

function required(args, flag) {
  const value = args[flag];
  if (value === undefined || value === "") {
    throw new Error(`missing --${flag}`);
  }
  return value;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const file =
    typeof args.file === "string" && args.file !== ""
      ? args.file
      : CADENCE_PATH;
  const cadence = JSON.parse(readFileSync(file, "utf8"));
  const next = nextCadence(cadence, {
    turn: required(args, "turn"),
    tag: required(args, "tag"),
    commit: required(args, "commit"),
    apkBytes: required(args, "apk-bytes"),
    run: required(args, "run"),
    url: required(args, "url"),
    signing: required(args, "signing"),
  });
  writeFileSync(file, formatCadence(next));
  process.stdout.write(
    `cadence turn ${next.lastTurn} -> tag ${next.lastTag}, next due ${next.nextDueTurn}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href
) {
  try {
    main();
  } catch (error) {
    console.error(`release-cadence-write: ${error.message}`);
    process.exitCode = 1;
  }
}
