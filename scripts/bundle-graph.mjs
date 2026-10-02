/** Follow static imports only; route, PDF and worker chunks stay deferred. */
export function staticEntryFiles(manifest) {
  const roots = Object.keys(manifest).filter((key) => manifest[key].isEntry);
  if (!roots.length) throw new Error("Build manifest has no entrypoint");
  const visited = new Set();
  const files = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    const entry = manifest[key];
    if (!entry || typeof entry.file !== "string")
      throw new Error(`Unresolved build manifest import: ${key}`);
    visited.add(key);
    if (/\.(?:js|mjs)$/.test(entry.file)) files.add(entry.file);
    for (const dependency of entry.imports ?? []) visit(dependency);
  }
  for (const root of roots) visit(root);
  return files;
}
