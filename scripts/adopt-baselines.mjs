#!/usr/bin/env node
/**
 * Adopt visual baselines from a hosted run, never from a local renderer.
 *
 * The rule in the handoff is simple: a screenshot may only come from a CI
 * artifact that was inspected first. Doing that by hand means downloading a
 * zip, decoding two PNGs to find out whether the bytes differ or only the
 * pixel data does, and then copying the file. This script does the same steps
 * in one command and refuses to guess: it prints the plan by default and only
 * copies with --apply.
 *
 *   node scripts/adopt-baselines.mjs --run 43068909386
 *   node scripts/adopt-baselines.mjs --run 43068909386 --apply
 *
 * A byte difference is not a pixel difference: PNG metadata (chunk order,
 * timestamps) changes without the picture changing. Comparing the inflated
 * IDAT stream is enough because the same pixels always filter to the same
 * bytes, and it costs a fraction of a full decode.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative } from "node:path";
import { inflateSync } from "node:zlib";
import { pathToFileURL } from "node:url";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function pixelHash(file) {
  const data = readFileSync(file);
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("latin1");
    if (type === "IDAT")
      chunks.push(data.subarray(offset + 8, offset + 8 + length));
    offset += length + 12;
    if (type === "IEND") break;
  }
  if (chunks.length === 0) return null;
  try {
    return createHash("sha1")
      .update(inflateSync(Buffer.concat(chunks)))
      .digest("hex");
  } catch {
    return null;
  }
}

/** Every PNG under `root`, keyed by basename, so an artifact can be matched. */
export function indexPngs(root, read = readdirSync, stat = statSync) {
  const found = new Map();
  const walk = (dir) => {
    for (const entry of read(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith(".png") && entry.isFile())
        found.set(entry.name, path);
      else if (entry.name.endsWith(".png") && stat(path).isFile())
        found.set(entry.name, path);
    }
  };
  walk(root);
  return found;
}

/**
 * Compare the artifact against the repository. `same` counts files whose
 * pixels match; `changed` lists files whose pixels differ; `bytesOnly` lists
 * files that differ in bytes but render the same.
 */
export function plan(artifactPngs, repoPngs) {
  const result = { same: 0, changed: [], bytesOnly: [], missing: [] };
  for (const [name, artifactPath] of artifactPngs) {
    const repoPath = repoPngs.get(name);
    if (!repoPath) {
      result.missing.push(name);
      continue;
    }
    const artifactHash = pixelHash(artifactPath);
    const repoHash = pixelHash(repoPath);
    if (artifactHash && artifactHash === repoHash) {
      result.same += 1;
    } else if (artifactHash && repoHash) {
      result.changed.push({ name, artifactPath, repoPath });
    } else {
      result.bytesOnly.push({ name, artifactPath, repoPath });
    }
  }
  return result;
}

export function artifactName(runId) {
  if (!/^\d+$/.test(String(runId))) throw new Error("run id must be digits");
  return `visual-baselines-${runId}`;
}

function repoRoot() {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();
}

function download(runId, destination) {
  execFileSync(
    "gh",
    [
      "run",
      "download",
      String(runId),
      "-n",
      artifactName(runId),
      "-D",
      destination,
    ],
    {
      stdio: ["ignore", "ignore", "inherit"],
    },
  );
}

function main(argv) {
  const runId = argv.find((arg) => arg === "--run")
    ? argv[argv.indexOf("--run") + 1]
    : undefined;
  const apply = argv.includes("--apply");
  if (!runId) {
    console.error(
      "usage: node scripts/adopt-baselines.mjs --run <runId> [--apply]",
    );
    return 1;
  }
  const root = repoRoot();
  const workdir = mkdtempSync(join(tmpdir(), "gys-baselines-"));
  download(runId, workdir);
  const artifact = indexPngs(workdir);
  const repo = indexPngs(join(root, "apps/web/e2e"));
  const result = plan(artifact, repo);
  console.log(
    `run ${runId}: ${artifact.size} pngs, ${result.same} identical, ${result.changed.length} changed, ${result.bytesOnly.length} bytes-only, ${result.missing.length} unknown`,
  );
  for (const item of result.changed)
    console.log(
      `  changed     ${item.name} -> ${relative(root, item.repoPath)}`,
    );
  for (const item of result.bytesOnly)
    console.log(`  bytes-only  ${item.name}`);
  for (const name of result.missing)
    console.log(`  unknown     ${name} (no file in apps/web/e2e)`);
  writeFileSync(
    join(workdir, "plan.json"),
    JSON.stringify({ runId, ...result }, null, 2),
  );
  if (!apply) {
    console.log(
      `\nplan written to ${join(workdir, "plan.json")}; rerun with --apply to copy ${result.changed.length} file(s)`,
    );
    return 0;
  }
  for (const item of result.changed)
    copyFileSync(item.artifactPath, item.repoPath);
  console.log(
    `\ncopied ${result.changed.length} file(s); inspect the diff before committing`,
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
