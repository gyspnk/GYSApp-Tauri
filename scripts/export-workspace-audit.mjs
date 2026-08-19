import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dirname, "..");
const results = resolve(repositoryRoot, "apps/web/test-results");
const archive = resolve(results, "workspace-source.tar.gz");
mkdirSync(results, { recursive: true });
execFileSync(
  "tar",
  [
    "-czf",
    archive,
    "--exclude=.git",
    "--exclude=node_modules",
    "--exclude=apps/web/dist",
    "--exclude=apps/web/test-results",
    "--exclude=apps/web/public/offline/bible",
    "--exclude=apps/web/public/offline/soundfont",
    "--exclude=apps/web/public/vendor",
    "--exclude=apps/web/public/assets/pdf",
    "-C",
    repositoryRoot,
    ".github",
    ".githooks",
    "apps/bff",
    "apps/native/package.json",
    "apps/native/README.md",
    "apps/native/src-tauri/Cargo.toml",
    "apps/native/src-tauri/build.rs",
    "apps/native/src-tauri/tauri.conf.json",
    "apps/native/src-tauri/capabilities",
    "apps/native/src-tauri/permissions",
    "apps/native/src-tauri/src",
    "apps/web/package.json",
    "apps/web/playwright.config.ts",
    "apps/web/tsconfig.json",
    "apps/web/vite.config.ts",
    "apps/web/vitest.config.ts",
    "apps/web/index.html",
    "apps/web/public",
    "apps/web/src",
    "apps/web/e2e",
    "packages",
    "scripts",
    "docs",
    "package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "tsconfig.base.json",
    "tsconfig.json",
    "README.md",
    "SECURITY.md",
  ],
  { cwd: repositoryRoot, stdio: "inherit" },
);
console.log(archive);
