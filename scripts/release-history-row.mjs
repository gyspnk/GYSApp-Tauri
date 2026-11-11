#!/usr/bin/env node
// Adds the release row to the "Riwayat rilis" table, following the columns that
// the table already has instead of inventing new ones.
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

export const DEFAULT_FILE = "docs/plans/release-cadence.md";

/** Formats a byte count the way the history table does: 36 118 859. */
export function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isInteger(bytes) || bytes < 0) {
    throw new Error(`apk-bytes must be a whole number, got ${value}`);
  }
  return String(bytes).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

function wholeNumber(value, name) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${name} must be a whole number, got ${value}`);
  }
  return number;
}

/**
 * Builds one history row using the table's column order:
 * turn, tag, run, APK bytes, commit, note.
 */
export function historyRow({
  turn,
  tag,
  apkBytes,
  run,
  date,
  commit = "",
  note = "",
}) {
  const turnValue = wholeNumber(turn, "turn");
  const tagValue = String(tag ?? "").trim();
  if (!/^v[0-9][A-Za-z0-9.-]+$/.test(tagValue)) {
    throw new Error(`tag must look like v0.1.0-preview.<date>.<n>, got ${tag}`);
  }
  const runValue = wholeNumber(run, "run");
  const day = date === undefined ? "" : String(date).trim();
  if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    throw new Error(`date must be YYYY-MM-DD, got ${date}`);
  }
  const commitCell = commit
    ? `\`${String(commit).trim().slice(0, 8)}\``
    : "\u2014";
  const noteCell = note || (day ? `rilis ${day}` : "\u2014");
  return `| ${turnValue} | \`${tagValue}\` | \`${runValue}\` | ${formatBytes(apkBytes)} | ${commitCell} | ${noteCell} |`;
}

function cellsOf(line) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function rowOf(cells, widths) {
  return `| ${cells.map((cell, index) => cell.padEnd(widths[index])).join(" | ")} |`;
}

/**
 * Inserts `row` after the table separator, or replaces the row whose turn
 * matches. The whole table is re-padded so the diff stays one line.
 */
export function upsertHistory(markdown, row, turn) {
  const lines = String(markdown).split("\n");
  const headerIndex = lines.findIndex((line) =>
    /^\|\s*Putaran\s*\|/i.test(line.trimStart()),
  );
  if (headerIndex === -1) {
    throw new Error("history table with a `Putaran` header was not found");
  }
  const separator = lines[headerIndex + 1] ?? "";
  if (!/^\|[\s:|-]+\|$/.test(separator.trim())) {
    throw new Error("history table separator row was not found");
  }
  const header = cellsOf(lines[headerIndex]);
  let end = headerIndex + 2;
  while (end < lines.length && lines[end].trim().startsWith("|")) end += 1;
  const rows = lines.slice(headerIndex + 2, end).map(cellsOf);
  const turnValue = String(turn).trim();
  const next = cellsOf(row);
  const replacement = header.map((_, index) => next[index] ?? "\u2014");
  const existing = rows.findIndex((cells) => cells[0] === turnValue);
  if (existing === -1) {
    rows.unshift(replacement);
  } else {
    rows[existing] = replacement;
  }
  const widths = header.map((_, index) =>
    Math.max(
      3,
      header[index].length,
      ...rows.map((cells) => cells[index].length),
    ),
  );
  const table = [
    rowOf(header, widths),
    `| ${widths.map((width) => "-".repeat(width)).join(" | ")} |`,
    ...rows.map((cells) => rowOf(cells, widths)),
  ];
  lines.splice(headerIndex, end - headerIndex, ...table);
  return lines.join("\n");
}

function main() {
  const { values } = parseArgs({
    options: {
      turn: { type: "string" },
      tag: { type: "string" },
      "apk-bytes": { type: "string" },
      run: { type: "string" },
      date: { type: "string" },
      commit: { type: "string" },
      note: { type: "string" },
      file: { type: "string", default: DEFAULT_FILE },
      write: { type: "boolean", default: false },
    },
  });
  const row = historyRow({
    turn: values.turn,
    tag: values.tag,
    apkBytes: values["apk-bytes"],
    run: values.run,
    date: values.date,
    commit: values.commit,
    note: values.note,
  });
  const file = values.file;
  const before = readFileSync(file, "utf8");
  const after = upsertHistory(before, row, values.turn);
  if (!values.write) {
    process.stdout.write(after);
    return;
  }
  if (after === before) {
    process.stdout.write(
      `release-history-row: ${file} already has turn ${values.turn}\n`,
    );
    return;
  }
  writeFileSync(file, after);
  process.stdout.write(`release-history-row: wrote ${file}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `release-history-row: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
