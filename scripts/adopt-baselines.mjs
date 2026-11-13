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
 *
 * A pixel difference is not a design change either: the encoder can move a
 * handful of pixels in a band that nobody sees. `--min-diff` and `--only`
 * exist so a run that changes three screenshots on purpose does not drag six
 * noise files along with it.
 *
 *   node scripts/adopt-baselines.mjs --run 43500689118 --min-diff 1000
 *   node scripts/adopt-baselines.mjs --run 43500689118 --only kidung-390x844
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

/**
 * Decode a PNG to raw RGB(A) rows. Only the shapes Playwright writes are
 * supported (8-bit, colour type 2 or 6, no interlace); anything else returns
 * null so a caller can fall back to "changed, unknown size".
 */
export function decodePng(file) {
  const data = readFileSync(file);
  if (!data.subarray(0, 8).equals(PNG_SIGNATURE)) return null;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colour = 0;
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString("latin1");
    const body = data.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colour = body[9];
      if (body[12] !== 0) return null;
    } else if (type === "IDAT") chunks.push(body);
    offset += length + 12;
    if (type === "IEND") break;
  }
  const channels = { 2: 3, 6: 4 }[colour];
  if (!channels || depth !== 8 || !width || !height) return null;
  let raw;
  try {
    raw = inflateSync(Buffer.concat(chunks));
  } catch {
    return null;
  }
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    for (let i = 0; i < stride; i += 1) {
      const left = i >= channels ? line[i - channels] : 0;
      const up = previous[i];
      const corner = i >= channels ? previous[i - channels] : 0;
      if (filter === 1) line[i] = (line[i] + left) & 0xff;
      else if (filter === 2) line[i] = (line[i] + up) & 0xff;
      else if (filter === 3) line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) {
        const estimate = left + up - corner;
        const pa = Math.abs(estimate - left);
        const pb = Math.abs(estimate - up);
        const pc = Math.abs(estimate - corner);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : corner;
        line[i] = (line[i] + predictor) & 0xff;
      }
    }
    line.copy(pixels, y * stride);
    previous = line;
  }
  return { width, height, channels, pixels };
}

/**
 * Count pixels that differ by more than `threshold` on any channel, and the
 * box that contains them. Returns null when the two images cannot be compared
 * (different size, unsupported encoding).
 */
export function pixelDiff(first, second, threshold = 6) {
  const a = decodePng(first);
  const b = decodePng(second);
  if (!a || !b) return null;
  if (a.width !== b.width || a.height !== b.height) return null;
  const channels = Math.min(a.channels, b.channels);
  const stride = a.width * a.channels;
  let diff = 0;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < a.height; y += 1) {
    for (let x = 0; x < a.width; x += 1) {
      const i = y * stride + x * a.channels;
      let moved = false;
      for (let c = 0; c < channels; c += 1)
        if (Math.abs(a.pixels[i + c] - b.pixels[i + c]) > threshold) {
          moved = true;
          break;
        }
      if (!moved) continue;
      diff += 1;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return diff === 0
    ? { diff: 0, box: null }
    : { diff, box: { left: minX, top: minY, right: maxX, bottom: maxY } };
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
      result.changed.push({
        name,
        artifactPath,
        repoPath,
        ...(pixelDiff(artifactPath, repoPath) ?? { diff: null, box: null }),
      });
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
  const only = argv.includes("--only")
    ? new Set(
        (argv[argv.indexOf("--only") + 1] ?? "")
          .split(",")
          .map((name) => name.trim())
          .filter(Boolean),
      )
    : null;
  const minDiff = argv.includes("--min-diff")
    ? Number(argv[argv.indexOf("--min-diff") + 1])
    : 0;
  if (!runId || !Number.isFinite(minDiff) || minDiff < 0) {
    console.error(
      "usage: node scripts/adopt-baselines.mjs --run <runId> [--apply] [--only a.png,b.png] [--min-diff 1000]",
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
  for (const item of result.changed) {
    const box = item.box
      ? `(${item.box.left},${item.box.top})-(${item.box.right},${item.box.bottom})`
      : "-";
    const pixels = item.diff === null ? "?" : String(item.diff);
    console.log(
      `  changed     ${item.name} diff=${pixels} box=${box} -> ${relative(root, item.repoPath)}`,
    );
  }
  for (const item of result.bytesOnly)
    console.log(`  bytes-only  ${item.name}`);
  for (const name of result.missing)
    console.log(`  unknown     ${name} (no file in apps/web/e2e)`);
  writeFileSync(
    join(workdir, "plan.json"),
    JSON.stringify({ runId, ...result }, null, 2),
  );
  const selected = result.changed.filter(
    (item) =>
      (!only || only.has(item.name)) &&
      (item.diff === null || item.diff >= minDiff),
  );
  const skipped = result.changed.length - selected.length;
  if (!apply) {
    console.log(
      `\nplan written to ${join(workdir, "plan.json")}; rerun with --apply to copy ${selected.length} file(s)` +
        (skipped ? ` (${skipped} skipped by --only/--min-diff)` : ""),
    );
    return 0;
  }
  for (const item of selected) copyFileSync(item.artifactPath, item.repoPath);
  console.log(
    `\ncopied ${selected.length} file(s)` +
      (skipped ? `, skipped ${skipped}` : "") +
      "; inspect the diff before committing",
  );
  return 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  process.exitCode = main(process.argv.slice(2));
}
