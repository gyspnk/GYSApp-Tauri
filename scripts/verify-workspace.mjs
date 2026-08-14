import { readdir } from "node:fs/promises";
import { join } from "node:path";

const roots = ["apps", "packages"];
const expected = new Set([
  "contracts",
  "domain",
  "testkit",
  "web",
  "bff",
  "native",
]);
const discovered = new Set();

for (const root of roots) {
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (entry.isDirectory()) discovered.add(entry.name);
  }
}

const missing = [...expected].filter((name) => !discovered.has(name));
if (missing.length > 0) {
  throw new Error(
    `Workspace package directories missing: ${missing.join(", ")}`,
  );
}

const packageFiles = [
  join("packages", "contracts", "package.json"),
  join("packages", "domain", "package.json"),
  join("apps", "bff", "package.json"),
  join("apps", "web", "package.json"),
];
for (const file of packageFiles) {
  try {
    await import(`node:fs/promises`).then(({ access }) => access(file));
  } catch {
    throw new Error(`Expected workspace manifest missing: ${file}`);
  }
}

console.log(
  `Workspace verified: ${packageFiles.length} buildable packages discovered.`,
);
