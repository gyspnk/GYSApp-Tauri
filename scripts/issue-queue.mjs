#!/usr/bin/env node
// The round queue comes from open issues, not from memory. This reads them with
// `gh` and prints them in the order the round should work on them: real defects
// first, then harness work, then releases, and blocked items last so they never
// crowd out something actionable.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PRIORITY = [
  ["bug", 0],
  ["harness", 1],
  ["release", 2],
  ["blocked", 3],
];

export function labelRank(labels) {
  let rank = 4;
  for (const [name, value] of PRIORITY) {
    if (labels.includes(name)) rank = Math.min(rank, value);
  }
  return rank;
}

export function parseIssues(json) {
  const rows = Array.isArray(json) ? json : [];
  return rows.map((row) => ({
    number: Number(row.number),
    title: String(row.title ?? ""),
    labels: (Array.isArray(row.labels) ? row.labels : []).map(
      (label) => label?.name ?? String(label),
    ),
    updatedAt: String(row.updatedAt ?? ""),
  }));
}

export function queue(issues) {
  return [...issues].sort((a, b) => {
    const rank = labelRank(a.labels) - labelRank(b.labels);
    if (rank !== 0) return rank;
    if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? -1 : 1;
    return a.number - b.number;
  });
}

export function formatQueue(rows) {
  return rows
    .map((row, index) => {
      const labels = row.labels.length > 0 ? ` [${row.labels.join(", ")}]` : "";
      return `${index + 1}. #${row.number} ${row.title}${labels}`;
    })
    .join("\n");
}

function readIssues(limit) {
  const output = execFileSync(
    "gh",
    [
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      String(limit),
      "--json",
      "number,title,labels,updatedAt",
    ],
    { encoding: "utf8" },
  );
  return parseIssues(JSON.parse(output));
}

function main(argv) {
  const index = argv.indexOf("--limit");
  const limit = index >= 0 ? Number(argv[index + 1]) : 50;
  if (!Number.isInteger(limit) || limit <= 0) {
    console.error("issue-queue: --limit must be a positive integer");
    return 2;
  }
  const rows = queue(readIssues(limit));
  if (rows.length === 0) {
    console.log("No open issues: the round queue is empty.");
    return 0;
  }
  if (argv.includes("--json")) {
    console.log(JSON.stringify(rows, null, 2));
    return 0;
  }
  const actionable = rows.filter((row) => !row.labels.includes("blocked"));
  console.log(`${actionable.length} actionable issue(s), in round order:`);
  console.log(formatQueue(actionable));
  const blocked = rows.length - actionable.length;
  if (blocked > 0) console.log(`(${blocked} blocked issue(s) listed last)`);
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
