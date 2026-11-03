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

/** The always-cheap tier: shell, settings, deep links and e-GYS login. */
const CORE_SPECS = [
  "e2e/smoke.spec.ts",
  "e2e/settings-data-integrity.spec.ts",
  "e2e/more-section-deeplink.spec.ts",
  "e2e/more-device-data.spec.ts",
  "e2e/account-menu.spec.ts",
  "e2e/egys-v1.spec.ts",
];

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

  const unknownShared = changedFiles.filter((file) => {
    if (/\.test\.[cm]?[jt]sx?$/.test(file)) return false;
    // A Playwright config changes how the suite runs, not what the app renders.
    // Treating it as "unknown shared" used to downgrade a design change (for
    // example app-design.css) to the core tier and skip the sweeps entirely.
    if (/^apps\/web\/playwright[^/]*\.ts$/.test(file)) return false;
    if (file.startsWith("apps/web/e2e/") && file.endsWith(".spec.ts"))
      return false;
    if (
      /^(?:packages\/(?:contracts|domain|testkit)\/src\/|apps\/web\/public\/sw\.js|pnpm-lock\.yaml|package\.json|apps\/web\/(?:package\.json|vite\.config|playwright))/.test(
        file,
      )
    )
      return true;
    // Any stylesheet under src/ is global; let it reach the design branch
    // instead of the unclassified fallback (which skips every sweep).
    if (/^apps\/web\/src\/(?:styles\/[^/]+|[^/]+)\.css$/.test(file))
      return false;
    if (!file.startsWith("apps/web/src/")) return false;
    return !/(?:bible|sql|pericope|cross-ref|sauh|suara|kidung|hymn|midi|chord|literatur|distributed|asset|pdf|direct-manipulation|ui-preferences|faith|reading-zoom|app-design\.css|App\.tsx|styles\.css|ui-hardening|calm-liturgical|icons\.tsx|i18n)/.test(
      file,
    );
  });
  if (unknownShared.length)
    // Bounded fallback: an unclassified shared change could touch anything, so
    // run the same core tier used locally instead of the whole 824-test suite.
    // The full suite still runs on main pushes and on a `full-ci` label.
    return {
      description: `Core browser tier for unclassified shared changes: ${unknownShared.join(", ")}`,
      args: [...CORE_SPECS, ...userArgs],
      changedFiles,
    };

  const specFiles = new Set();
  const grepPatterns = new Set();
  let runSmokeAll = false;

  for (const file of changedFiles) {
    if (file.startsWith("apps/web/e2e/") && file.endsWith(".spec.ts")) {
      specFiles.add(file.replace("apps/web/", ""));
      continue;
    }

    if (/apps\/web\/src\/(?:faith\.tsx|reading-zoom\.ts)$/.test(file)) {
      specFiles.add("e2e/faith-zoom.spec.ts");
      specFiles.add("e2e/reading-family-usability.spec.ts");
      specFiles.add("e2e/reading-direct-flow.spec.ts");
      specFiles.add("e2e/visual-reading.spec.ts");
      specFiles.add("e2e/accessibility.spec.ts");
      runSmokeAll = true;
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

    if (
      /apps\/web\/src\/bible(?:-(?:chapter|verse-text|search-panel|notes-popup|reader-storage|highlights|search))?\.tsx?$/.test(
        file,
      )
    ) {
      specFiles.add("e2e/bible-annotations.spec.ts");
      specFiles.add("e2e/reader-data-loading.spec.ts");
      specFiles.add("e2e/visual.spec.ts");
      specFiles.add("e2e/accessibility.spec.ts");
      // Annotation tests include legacy migration without "Bible" in the title.
      runSmokeAll = true;
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

    const isKidungPresentation =
      file.includes("kidung-") ||
      file.includes("kidung.tsx") ||
      file.includes("hymn-detail") ||
      file.includes("hymn-reader") ||
      file.includes("hymn-payloads") ||
      file.includes("hymn-search-corpus") ||
      file.includes("hymn-metadata");

    if (
      file.includes("kidung") ||
      file.includes("hymn") ||
      file.includes("midi") ||
      file.includes("chord")
    ) {
      specFiles.add("e2e/navigation-layout.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      specFiles.add("e2e/kidung-catalog-error.spec.ts");
      specFiles.add("e2e/kidung-hymn-alias.spec.ts");
      grepPatterns.add("hymn|Kidung|MIDI|chord");
    }

    if (isKidungPresentation) {
      specFiles.add("e2e/kidung-usability.spec.ts");
      specFiles.add("e2e/kidung-loading.spec.ts");
      specFiles.add("e2e/reader-data-loading.spec.ts");
      specFiles.add("e2e/kidung-style-behavior.spec.ts");
      specFiles.add("e2e/kidung-offline.spec.ts");
      specFiles.add("e2e/playlist-parity.spec.ts");
      specFiles.add("e2e/visual.spec.ts");
      specFiles.add("e2e/accessibility.spec.ts");
      specFiles.add("e2e/universal-usability.spec.ts");
      specFiles.add("e2e/responsive-layout-matrix.spec.ts");
      specFiles.add("e2e/roadmap-ui-matrix.spec.ts");
      runSmokeAll = true;
    }

    if (file.includes("literature") || file.includes("literatur")) {
      specFiles.add("e2e/smoke.spec.ts");
      specFiles.add("e2e/literature-recovery.spec.ts");
      specFiles.add("e2e/literature-loading.spec.ts");
      specFiles.add("e2e/literature-offline.spec.ts");
      grepPatterns.add("literature");
    }

    if (file.includes("distributed") || file.includes("asset")) {
      specFiles.add("e2e/distributed-assets.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      grepPatterns.add("asset|offline");
    }

    if (
      file.includes("ui-preferences") ||
      file.includes("calm-liturgical.css")
    ) {
      specFiles.add("e2e/appearance-preferences.spec.ts");
      specFiles.add("e2e/smoke.spec.ts");
      specFiles.add("e2e/navigation-layout.spec.ts");
      specFiles.add("e2e/accessibility.spec.ts");
      specFiles.add("e2e/universal-usability.spec.ts");
      specFiles.add("e2e/responsive-layout-matrix.spec.ts");
      specFiles.add("e2e/roadmap-ui-matrix.spec.ts");
      runSmokeAll = true;
    }

    if (
      file.startsWith("apps/web/src/pdf") ||
      file.includes("direct-manipulation")
    ) {
      specFiles.add("e2e/pdf-reader-efficiency.spec.ts");
      specFiles.add("e2e/kidung-pdf-density.spec.ts");
      specFiles.add("e2e/direct-manipulation.spec.ts");
      specFiles.add("e2e/media-load.spec.ts");
      runSmokeAll = true;
    }

    if (
      // Every stylesheet under src/ is global: the numbered layers hold the
      // layout, tokens and responsive rules the whole app shares. Treating them
      // as ordinary source silently dropped the cross-screen sweeps.
      (/^apps\/web\/src\/(styles\/[^/]+\.css|[^/]+\.css)$/.test(file) &&
        !file.includes("test")) ||
      file.includes("app-design.css") ||
      file.includes("App.tsx") ||
      file.includes("styles.css") ||
      file.includes("ui-hardening.css") ||
      file.includes("calm-liturgical.css") ||
      file.includes("icons.tsx") ||
      file.includes("i18n")
    ) {
      specFiles.add("e2e/smoke.spec.ts");
      specFiles.add("e2e/navigation-layout.spec.ts");
      specFiles.add("e2e/sidebar-collapse.spec.ts");
      specFiles.add("e2e/ux-refinement.spec.ts");
      specFiles.add("e2e/visual.spec.ts");
      specFiles.add("e2e/visual-reading.spec.ts");
      specFiles.add("e2e/faith-zoom.spec.ts");
      specFiles.add("e2e/accessibility.spec.ts");
      specFiles.add("e2e/universal-usability.spec.ts");
      specFiles.add("e2e/responsive-layout-matrix.spec.ts");
      specFiles.add("e2e/roadmap-ui-matrix.spec.ts");
      runSmokeAll = true;
    }
  }

  // The `-linux` baselines are rendered by the hosted image; comparing them in
  // the selective path costs minutes and repeats what the nightly shards do.
  // Only a change that touches the baselines themselves still pays for them.
  const visualSpecs = ["e2e/visual.spec.ts", "e2e/visual-reading.spec.ts"];
  const touchesVisuals = changedFiles.some(
    (file) => file.includes("-snapshots/") || file.includes("e2e/visual"),
  );
  if (!touchesVisuals) {
    for (const spec of visualSpecs) specFiles.delete(spec);
  }

  // Layout sweeps walk every route at every viewport; they are nightly
  // coverage, and pulling them into a one-screen change is what made the
  // routine path take minutes. A cascading style change still selects them.
  const generalSweeps = new Set([
    "e2e/responsive-layout-matrix.spec.ts",
    "e2e/roadmap-ui-matrix.spec.ts",
    "e2e/universal-usability.spec.ts",
    "e2e/smoke.spec.ts",
    "e2e/navigation-layout.spec.ts",
    "e2e/accessibility.spec.ts",
  ]);
  const touchesLayout = changedFiles.some((file) =>
    /(?:^|\/)(?:styles\/[^/]+\.css|[a-z-]+\.css|App\.tsx|icons\.tsx)$/.test(
      file,
    ),
  );
  // The nightly shards own the cross-screen sweeps. A feature stylesheet keeps
  // only the overflow matrix (the sweep that has caught real defects in a
  // single-screen change); the global design files still justify the full set,
  // because they can move every screen at once.
  const globalLayout = changedFiles.some((file) =>
    /(?:^|\/)(?:app-design\.css|App\.tsx|icons\.tsx|styles\/[^/]+\.css)$/.test(
      file,
    ),
  );
  const routineSweeps = new Set(["e2e/responsive-layout-matrix.spec.ts"]);
  for (const spec of generalSweeps) {
    const keep = touchesLayout && (globalLayout || routineSweeps.has(spec));
    if (!keep) specFiles.delete(spec);
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
