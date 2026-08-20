import { execSync, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const webDir = path.resolve(rootDir, "apps", "web");

// 1. Get changed files from git (staged, unstaged, untracked, and recent commit)
function getChangedFiles() {
  const files = new Set();

  try {
    const statusOutput = execSync("git status --porcelain -uall", {
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
      const diffHead = execSync("git diff --name-only HEAD", {
        cwd: rootDir,
        encoding: "utf8",
      });
      for (const line of diffHead.split("\n")) {
        const trimmed = line.trim();
        if (trimmed) files.add(trimmed.replace(/\\/g, "/"));
      }
    } catch {
      // ignore
    }
  } catch (error) {
    console.warn(
      "Could not determine git status, falling back to smoke run.",
      error,
    );
  }

  return [...files];
}

// 2. Map changed files to Playwright specs or grep patterns
function resolveSelectiveTestArgs(changedFiles, userArgs) {
  if (userArgs.includes("--all") || userArgs.includes("-a")) {
    const filtered = userArgs.filter((a) => a !== "--all" && a !== "-a");
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

    // Bible
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

    // Sauh Bagi Jiwa
    if (file.includes("sauh")) {
      specFiles.add("e2e/sauh-lifecycle.spec.ts");
      specFiles.add("e2e/sauh-error.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("Sauh|home|online content");
    }

    // Suara Sejati
    if (file.includes("suara")) {
      specFiles.add("e2e/suara-lifecycle.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("Suara|online content");
    }

    // Kidung / Hymns / MIDI / Chords
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

    // Literature
    if (file.includes("literature") || file.includes("literatur")) {
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("literature");
    }

    // Distributed Assets
    if (file.includes("distributed") || file.includes("asset")) {
      specFiles.add("e2e/distributed-assets.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("asset|offline");
    }

    // App shell, Header, Topbar, Global Styles, Navigation
    if (
      file.includes("App.tsx") ||
      file.includes("styles.css") ||
      file.includes("icons.tsx") ||
      file.includes("i18n")
    ) {
      specFiles.add("e2e/smoke.spec.ts");
      specFiles.add("e2e/navigation-layout.spec.ts");
      specFiles.add("e2e/accessibility.spec.ts");
      runSmokeAll = true;
    }
  }

  if (!specFiles.size && !grepPatterns.size) {
    return {
      description:
        "Changes outside specific feature modules; running smoke suite",
      args: ["e2e/smoke.spec.ts", ...userArgs],
    };
  }

  const args = [...specFiles];

  if (
    grepPatterns.size &&
    !runSmokeAll &&
    !userArgs.some((a) => a === "-g" || a === "--grep")
  ) {
    const combinedGrep = [...grepPatterns].join("|");
    args.push("-g", combinedGrep);
  }

  args.push(...userArgs);

  return {
    description: `Selective tests for ${changedFiles.length} changed file(s)`,
    args,
    changedFiles,
  };
}

// 3. Execute
const userArgs = process.argv.slice(2);
const changedFiles = getChangedFiles();
const plan = resolveSelectiveTestArgs(changedFiles, userArgs);

console.log(`\n🔍 [Selective E2E] ${plan.description}`);
if (plan.changedFiles?.length) {
  console.log(
    `📁 Changed files:\n   - ${plan.changedFiles.slice(0, 8).join("\n   - ")}${plan.changedFiles.length > 8 ? `\n   - ... (${plan.changedFiles.length - 8} more)` : ""}`,
  );
}
console.log(`🚀 Running: pnpm exec playwright test ${plan.args.join(" ")}\n`);

const result = spawnSync("pnpm", ["exec", "playwright", "test", ...plan.args], {
  cwd: webDir,
  stdio: "inherit",
  shell: true,
});

process.exit(result.status ?? 0);
