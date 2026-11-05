// The service worker refuses to install when an integrity entry points at a
// path it does not precache ("Core integrity path invalid"), so the manifest
// must be derived from the same list the worker ships with.
export function corePathsFromSw(source) {
  const block = source.match(/const CORE = \[([\s\S]*?)\n\]/);
  if (!block) throw new Error("CORE list not found in sw.js");
  return [...block[1].matchAll(/"([^"]*)"/g)].map((match) => match[1]);
}

export async function coreIntegrityFrom({ packItems, corePaths, digestFile }) {
  const precached = new Set(corePaths);
  const entries = [];
  for (const item of packItems) {
    if (!precached.has(item.path)) continue;
    entries.push([item.path, `sha256-${item.sha256}`]);
  }
  const covered = new Set(entries.map(([path]) => path));
  for (const path of corePaths) {
    if (covered.has(path) || !path.startsWith("offline/")) continue;
    try {
      entries.push([path, `sha256-${await digestFile(path)}`]);
    } catch {
      // A precache entry that is not a shipped file is covered by the plain
      // fetch path alone; nothing to verify.
    }
  }
  return Object.fromEntries(entries);
}
