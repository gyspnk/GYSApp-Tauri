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

export { isBuildConfig, isDocs };
