/** Pure classification for the inner loop; kept separate so it can be tested. */

const isDocs = (file) =>
  file.startsWith("docs/") || file.endsWith(".md") || file === "CHANGELOG.md";

const isBuildConfig = (file) =>
  /(?:^|\/)(?:vite\.config\.ts|playwright[^/]*\.ts|package\.json|tsconfig[^/]*\.json|pnpm-lock\.yaml)$/.test(
    file,
  );

export function classifyChanges(files) {
  const docs = files.filter(isDocs);
  const code = files.filter((file) => !isDocs(file));
  return {
    docs,
    code,
    hasWebSource: code.some((file) => file.startsWith("apps/web/src/")),
    hasPackageSource: code.some((file) => /^packages\/[^/]+\/src\//.test(file)),
    hasScripts: code.some((file) => file.startsWith("scripts/")),
    hasE2E: code.some(
      (file) => file.startsWith("apps/web/e2e/") && file.endsWith(".spec.ts"),
    ),
    hasBuildConfig: code.some(isBuildConfig),
    hasOther: code.some(
      (file) =>
        !file.startsWith("apps/web/src/") &&
        !file.startsWith("apps/web/e2e/") &&
        !file.startsWith("packages/") &&
        !file.startsWith("scripts/") &&
        !isBuildConfig(file),
    ),
  };
}

/**
 * Log rows from `gh run view --log-failed`: `job<TAB>step<TAB>timestamp text`.
 * The timestamp is glued to its message by a space, and CI colours the words.
 */
const logRow = (line) => {
  const parts = line.split("\t");
  if (parts.length < 3) return null;
  const text = parts
    .slice(2)
    .join("\t")
    .replace(/^\ufeff?\d{4}-\d{2}-\d{2}T[\d:.]+Z\s+/, "")
    // Colours arrive as real escapes over the API and as `^[` in a plain log.
    .replace(/(?:\u001b|\^\[)\[[\d;]*m/g, "");
  return { job: parts[0], step: parts[1], text };
};

// A hosted failure is only useful as the shortest honest answer: which job
// broke, which step, and the few log lines that say why. `--log-failed` only
// carries failed steps, but a step can also die without a matching phrase, so
// each job keeps a fallback of its first lines.
const interesting =
  /✘|✗|Error:|Error Context|AssertionError|issues found|error TS|Process completed with exit code/;

export function summarizeFailure(jobs, log, { perJob = 5 } = {}) {
  const rows = (jobs ?? [])
    .filter((job) => job.conclusion === "failure")
    .map((job) => ({
      job: job.name,
      steps: (job.steps ?? [])
        .filter((step) => step.conclusion === "failure")
        .map((step) => step.name),
      lines: [],
      fallback: [],
    }));
  const byJob = new Map(rows.map((row) => [row.job, row]));
  for (const line of String(log ?? "").split("\n")) {
    const row = logRow(line);
    const target = row && byJob.get(row.job);
    if (!target) continue;
    const text = row.text.trim();
    if (!text || target.lines.includes(text)) continue;
    if (interesting.test(text)) {
      if (target.lines.length < perJob) target.lines.push(text);
    } else if (target.fallback.length < 2) target.fallback.push(text);
  }
  return rows.map(({ fallback, ...row }) => ({
    ...row,
    lines: row.lines.length ? row.lines : fallback,
  }));
}

export function formatFailure(rows, { jobs = 4, width = 200 } = {}) {
  const out = [];
  for (const row of rows.slice(0, jobs)) {
    out.push(
      `✗ ${row.job}${row.steps.length ? ` — ${row.steps.join(", ")}` : ""}`,
    );
    for (const line of row.lines)
      out.push(
        `    ${line.length > width ? `${line.slice(0, width)}…` : line}`,
      );
  }
  return out;
}

export { isBuildConfig, isDocs };
