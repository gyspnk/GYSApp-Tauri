// Turn the perf log into a Markdown summary.
//
// The previous inline version matched the first line containing the marker,
// which can be a code frame from a printed stack, and then parsed garbage.
// Anchored regexes plus "take the last match" keep a red log from lying about
// the rows.
import { readFileSync } from "node:fs";

const MARK_ROW = /\[perf-row\] (\{.*\})$/;
const MARK_NAV = /\[runtime-navigation\] (\[.*\])$/;

function lastMatch(raw, pattern) {
  let payload = null;
  for (const line of raw.split("\n")) {
    const match = pattern.exec(line);
    if (!match) continue;
    try {
      payload = JSON.parse(match[1]);
    } catch {
      payload = null;
    }
  }
  return payload;
}

function collect(raw, pattern) {
  const rows = [];
  for (const line of raw.split("\n")) {
    const match = pattern.exec(line);
    if (!match) continue;
    try {
      rows.push(JSON.parse(match[1]));
    } catch {
      // A torn line is not a row; the next one still counts.
    }
  }
  return rows;
}

export function summarise(raw) {
  const rows = collect(raw, MARK_ROW);
  const navigation = lastMatch(raw, MARK_NAV);
  const out = [];
  if (rows.length === 0 && !navigation)
    return "No measurement rows were printed.\n";
  if (rows.length > 0) {
    out.push(
      "| route | viewport | ready ms | DOMContentLoaded ms | CLS | long tasks ms |",
      "| --- | --- | --- | --- | --- | --- |",
    );
    for (const row of rows) {
      out.push(
        `| ${row.id} | ${row.viewport} | ${row.readyMs} | ${row.domContentLoadedMs} | ${Number(row.layoutShift).toFixed(4)} | ${row.longTaskDuration} |`,
      );
    }
  }
  if (navigation) {
    out.push("", "| step | click → ready ms |", "| --- | --- |");
    for (const step of navigation) out.push(`| ${step.id} | ${step.ms} |`);
  }
  return `${out.join("\n")}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(summarise(readFileSync(process.argv[2], "utf8")));
}
