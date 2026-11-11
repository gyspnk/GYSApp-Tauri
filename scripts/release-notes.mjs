#!/usr/bin/env node
// Builds the release tag and changelog for the 25-turn Android release cadence.
//
// Usage (inside a checkout with full history):
//   node scripts/release-notes.mjs --from v0.1.0-preview.20261009.1 --date 2026-11-10 \
//     --existing v0.1.0-preview.20261110.1,v0.1.0-preview.20261110.2
// Prints JSON: { tag, notes, counts, commits }.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { androidApkName, readNativeVersion } from "./release-asset-name.mjs";

const NATIVE_CONFIG = new URL(
  "../apps/native/src-tauri/tauri.conf.json",
  import.meta.url,
);

const GROUPS = [
  ["feat", "Fitur"],
  ["fix", "Perbaikan"],
  ["perf", "Performa"],
  ["refactor", "Rapikan kode"],
  ["test", "Pengujian"],
  ["docs", "Dokumentasi"],
  ["build", "Build & rilis"],
  ["ci", "CI"],
  ["style", "Tampilan"],
  ["chore", "Perawatan"],
];

const MAX_PER_GROUP = 24;

/** Parses `git log --pretty=%h%x09%s` output into structured commits. */
export function parseCommits(log) {
  return String(log)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [hash, ...rest] = line.split("\t");
      const subject = rest.join("\t").trim();
      const match = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:\s*(.+)$/);
      return {
        hash,
        subject,
        type: match?.[1] ?? "other",
        description: match?.[2] ?? subject,
      };
    });
}

/** Groups parsed commits into ordered changelog sections. */
export function groupCommits(commits) {
  const groups = new Map();
  for (const commit of commits) {
    const key = GROUPS.some(([type]) => type === commit.type)
      ? commit.type
      : "other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(commit);
  }
  const order = [...GROUPS.map(([type]) => type), "other"];
  return order
    .filter((type) => groups.has(type))
    .map((type) => ({
      type,
      title: type === "other" ? "Lainnya" : GROUPS.find(([g]) => g === type)[1],
      commits: groups.get(type),
    }));
}

/** Formats the changelog markdown, capped per group so notes stay readable. */
export function buildChangelog(
  commits,
  { tag, date, limitPerGroup = MAX_PER_GROUP, version } = {},
) {
  const groups = groupCommits(commits);
  const counts = Object.fromEntries(
    groups.map((group) => [group.type, group.commits.length]),
  );
  const lines = [];
  lines.push(`# ${tag ?? "Rilis"}`);
  lines.push("");
  lines.push(
    `Tanggal: ${date ?? "hari ini"}. Dibangun otomatis dari \`main\`.`,
  );
  lines.push("");
  lines.push(
    `Total ${commits.length} perubahan: ` +
      groups
        .map((group) => `${group.commits.length} ${group.title.toLowerCase()}`)
        .join(", ") +
      ".",
  );
  for (const group of groups) {
    lines.push("");
    lines.push(`## ${group.title}`);
    lines.push("");
    for (const commit of group.commits.slice(0, limitPerGroup)) {
      lines.push(`- ${commit.description} (\`${commit.hash}\`)`);
    }
    if (group.commits.length > limitPerGroup) {
      lines.push(
        `- …dan ${group.commits.length - limitPerGroup} perubahan lain.`,
      );
    }
  }
  const apkName = androidApkName(
    version ?? readNativeVersion(readFileSync(NATIVE_CONFIG, "utf8")),
  );
  lines.push("");
  lines.push("## Artefak");
  lines.push("");
  lines.push(
    `- \`${apkName}\` — APK Android arm64 (tanda tangan debug, untuk pemasangan manual).`,
  );
  lines.push(
    "- `SHA256SUMS-android.txt` dan `native-provenance-android.json` — bukti integritas dan asal commit.",
  );
  lines.push("");
  lines.push(
    "Catatan: rilis ini adalah pratinjau. APK memakai identitas debug Android, jadi belum bisa dipakai untuk pembaruan Play Store.",
  );
  return { notes: lines.join("\n"), counts };
}

/** Picks the next `v0.1.0-preview.<YYYYMMDD>.<n>` tag for a given day. */
export function nextTag(date, existing = []) {
  const iso = String(date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso))
    throw new Error(`Invalid date: ${date}`);
  const day = iso.replaceAll("-", "");
  const prefix = `v0.1.0-preview.${day}.`;
  const used = existing
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => Number.parseInt(tag.slice(prefix.length), 10))
    .filter((value) => Number.isInteger(value) && value > 0);
  const next = used.length === 0 ? 1 : Math.max(...used) + 1;
  return `${prefix}${next}`;
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const from = args.from?.trim() || null;
  const date = args.date?.trim() || new Date().toISOString().slice(0, 10);
  const existing = String(args.existing ?? "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
  const tag = args.tag?.trim() || nextTag(date, existing);
  const range = from ? `${from}..HEAD` : "HEAD";
  const log = execFileSync("git", ["log", "--pretty=%h%x09%s", range], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const commits = parseCommits(log);
  const { notes, counts } = buildChangelog(commits, { tag, date });
  process.stdout.write(
    `${JSON.stringify({ tag, from, counts, notes }, null, 2)}\n`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1] ?? "").href
) {
  try {
    main();
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}
