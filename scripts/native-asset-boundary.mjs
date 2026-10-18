import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";

/** Source databases and compiler/debug artifacts cannot enter runtime packing. */
export async function assertNoBuildSourceAssets(directory) {
  const entries = await readdir(directory, {
    recursive: true,
    withFileTypes: true,
  });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const path = relative(directory, join(entry.parentPath, entry.name));
    if (
      /\.(?:d\.ts|map)$/i.test(entry.name) ||
      (/\.(?:js|mjs)$/i.test(entry.name) &&
        dirname(path) === "." &&
        !["sw.js", "startup.js"].includes(entry.name))
    ) {
      throw new Error(
        `TypeScript build output is forbidden in runtime assets: ${path}`,
      );
    }
    if (/\.(?:db|sqlite|sqlite3)$/i.test(entry.name)) {
      throw new Error(
        `SQLite build source is forbidden in runtime assets: ${path}`,
      );
    }
  }
}
