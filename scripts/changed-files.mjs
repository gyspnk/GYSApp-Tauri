/**
 * Files the next push would carry.
 *
 * `collectChangedFiles` answers "what is dirty in the working tree", which is
 * the wrong question inside a pre-push hook: the commit already exists, so the
 * tree looks clean and the formatting check would silently do nothing. The
 * guarded scripts therefore diff the merge base with the upstream branch and
 * add any still-uncommitted edits.
 */
import { spawnSync } from "node:child_process";
import { collectChangedFiles } from "./test-e2e-selective-core.mjs";

function git(rootDir, ...args) {
  const result = spawnSync("git", args, { cwd: rootDir, encoding: "utf8" });
  if (result.status !== 0) return "";
  return result.stdout.trim();
}

function upstreamRef(rootDir) {
  const upstream = git(
    rootDir,
    "rev-parse",
    "--abbrev-ref",
    "--symbolic-full-name",
    "@{u}",
  );
  if (upstream) return upstream;
  const branch = git(rootDir, "rev-parse", "--abbrev-ref", "HEAD");
  return branch && branch !== "HEAD" ? `origin/${branch}` : "";
}

export function collectPushFiles({ rootDir, env = process.env } = {}) {
  const files = new Set();
  const upstream = upstreamRef(rootDir);
  if (upstream) {
    const base = git(rootDir, "merge-base", upstream, "HEAD");
    const output = base
      ? git(
          rootDir,
          "diff",
          "--name-only",
          "--diff-filter=ACMR",
          `${base}..HEAD`,
        )
      : "";
    for (const line of output.split("\n"))
      if (line.trim()) files.add(line.trim());
  }
  try {
    for (const file of collectChangedFiles({ rootDir, env })) files.add(file);
  } catch {
    // A detached HEAD or a missing git binary still leaves the local edits.
  }
  return [...files];
}
