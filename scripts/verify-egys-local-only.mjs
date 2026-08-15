import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join, relative, resolve } from "node:path";

const forbiddenWorkflowPatterns = [
  {
    pattern: /(?:sync-egys|check-egys-upstream)\.mjs/i,
    reason: "upstream synchronization command",
  },
  {
    pattern: /EGYS_UPSTREAM_TOKEN/i,
    reason: "upstream credential",
  },
  {
    pattern: /git\s+(?:clone|fetch|ls-remote)[^\n]*egys/i,
    reason: "raw upstream Git access",
  },
  {
    pattern: /Gereja-Yesus-Sejati\/egys/i,
    reason: "private upstream repository reference",
  },
];

async function workflowFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await workflowFiles(path)));
    } else if (/\.ya?ml$/i.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

export async function findEgysWorkflowViolations(rootDirectory) {
  const root = resolve(rootDirectory);
  const workflowDirectory = join(root, ".github", "workflows");
  const violations = [];
  for (const file of await workflowFiles(workflowDirectory)) {
    const source = await readFile(file, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      const match = forbiddenWorkflowPatterns.find(({ pattern }) =>
        pattern.test(line),
      );
      if (match) {
        violations.push({
          file: relative(root, file).replaceAll("\\", "/"),
          line: index + 1,
          reason: match.reason,
        });
      }
    });
  }
  return violations;
}

export async function assertEgysLocalOnly(rootDirectory) {
  const violations = await findEgysWorkflowViolations(rootDirectory);
  if (violations.length) {
    const details = violations
      .map(({ file, line, reason }) => `${file}:${line} (${reason})`)
      .join(", ");
    throw new Error(
      `e-GYS synchronization is local-only; forbidden workflow access: ${details}`,
    );
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && resolve(process.argv[1]) === currentFile) {
  await assertEgysLocalOnly(process.cwd());
  console.log("e-GYS local-only workflow boundary verified.");
}
