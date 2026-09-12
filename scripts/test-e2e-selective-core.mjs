import { execSync } from "node:child_process";

function normalizeLines(output) {
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((file) => file.replace(/\\/g, "/"));
}

function validGitRef(value) {
  return typeof value === "string" && /^[A-Za-z0-9._/-]+$/.test(value);
}

export function collectChangedFiles({
  rootDir,
  env = process.env,
  execSyncImpl = execSync,
}) {
  const base = env.GYS_E2E_BASE?.trim();
  const head = env.GYS_E2E_HEAD?.trim();

  if (base && head) {
    if (!validGitRef(base) || !validGitRef(head)) {
      throw new Error("GYS_E2E_BASE and GYS_E2E_HEAD must be safe git refs");
    }
    const output = execSyncImpl(`git diff --name-only ${base}...${head}`, {
      cwd: rootDir,
      encoding: "utf8",
    });
    return [...new Set(normalizeLines(output))];
  }

  const files = new Set();
  try {
    const statusOutput = execSyncImpl("git status --porcelain -uall", {
      cwd: rootDir,
      encoding: "utf8",
    });
    for (const line of statusOutput.split("\n")) {
      if (!line || line.length < 4) continue;
      const parts = line.slice(3).split(" -> ");
      const filePath = parts[parts.length - 1].trim();
      if (filePath) files.add(filePath.replace(/\\/g, "/"));
    }

    try {
      const diffHead = execSyncImpl("git diff --name-only HEAD", {
        cwd: rootDir,
        encoding: "utf8",
      });
      for (const file of normalizeLines(diffHead)) files.add(file);
    } catch {
      // A working-tree status is still useful when HEAD diff is unavailable.
    }
  } catch (error) {
    console.warn(
      "Could not determine git status, falling back to smoke run.",
      error,
    );
  }

  return [...files];
}

export function resolveSelectiveTestArgs(changedFiles, userArgs) {
  if (userArgs.includes("--all") || userArgs.includes("-a")) {
    const filtered = userArgs.filter((arg) => arg !== "--all" && arg !== "-a");
    return { description: "Full test suite (--all requested)", args: filtered };
  }

  if (!changedFiles.length) {
    return {
      description: "No changed files detected; running smoke test suite",
      args: ["e2e/smoke.spec.ts", ...userArgs],
    };
  }

  const specFiles = new Set();
  const grepPatterns = new Set();
  let runSmokeAll = false;

  for (const file of changedFiles) {
    if (file.startsWith("apps/web/e2e/") && file.endsWith(".spec.ts")) {
      specFiles.add(file.replace("apps/web/", ""));
      continue;
    }

    if (
      file.includes("bible") ||
      file.includes("sql") ||
      file.includes("pericope") ||
      file.includes("cross-ref")
    ) {
      specFiles.add("e2e/smoke.spec.ts");
      specFiles.add("e2e/navigation-layout.spec.ts");
      grepPatterns.add("Bible");
    }

    if (file.includes("sauh")) {
      specFiles.add("e2e/sauh-lifecycle.spec.ts");
      specFiles.add("e2e/sauh-error.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("Sauh|home|online content");
    }

    if (file.includes("suara")) {
      specFiles.add("e2e/suara-lifecycle.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("Suara|online content");
    }

    if (
      file.includes("kidung") ||
      file.includes("hymn") ||
      file.includes("midi") ||
      file.includes("chord")
    ) {
      specFiles.add("e2e/navigation-layout.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("hymn|Kidung|MIDI|chord");
    }

    if (file.includes("literature") || file.includes("literatur")) {
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("literature");
    }

    if (file.includes("distributed") || file.includes("asset")) {
      specFiles.add("e2e/distributed-assets.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("asset|offline");
    }

    if (
      file.includes("App.tsx") ||
      file.includes("styles.css") ||
      file.includes("ui-hardening.css") ||
      file.includes("calm-liturgical.css") ||
      file.includes("icons.tsx") ||
      file.includes("i18n")
    ) {
      specFiles.add("e2e/smoke.spec.ts");
      specFiles.add("e2e/navigation-layout.spec.ts");
      specFiles.add("e2e/accessibility.spec.ts");
      specFiles.add("e2e/universal-usability.spec.ts");
      runSmokeAll = true;
    }
  }

  if (!specFiles.size && !grepPatterns.size) {
    return {
      description: "Changes outside specific feature modules; running smoke suite",
      args: ["e2e/smoke.spec.ts", ...userArgs],
    };
  }

  const args = [...specFiles];
  if (
    grepPatterns.size &&
    !runSmokeAll &&
    !userArgs.some((arg) => arg === "-g" || arg === "--grep")
  ) {
    args.push("-g", [...grepPatterns].join("|"));
  }
  args.push(...userArgs);

  return {
    description: `Selective tests for ${changedFiles.length} changed file(s)`,
    args,
    changedFiles,
  };
}
