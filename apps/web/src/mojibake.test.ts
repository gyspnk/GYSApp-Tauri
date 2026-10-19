import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Text that was UTF-8 decoded as Windows-1252 shows up as these sequences.
 * The settings copy was corrupted twice by an editor round-trip, so the guard
 * keeps the whole web source honest instead of trusting review.
 */
const MOJIBAKE = /Ã|Â|â€|âœ|â†|ðŸ|\uFFFD/;
const EXTENSIONS = /\.(?:ts|tsx|css|json|html)$/;
const SELF = fileURLToPath(import.meta.url);
const SOURCE_ROOT = fileURLToPath(new URL(".", import.meta.url));

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return EXTENSIONS.test(entry) ? [path] : [];
  });
}

describe("source encoding", () => {
  it("contains no double-encoded UTF-8 text", () => {
    const offenders = sourceFiles(SOURCE_ROOT)
      .filter((path) => path !== SELF)
      .flatMap((path) => {
        const lines = readFileSync(path, "utf8").split("\n");
        return lines
          .map((line, index) => ({ line, index }))
          .filter(({ line }) => MOJIBAKE.test(line))
          .map(
            ({ line, index }) =>
              `${relative(SOURCE_ROOT, path)}:${index + 1}: ${line.trim()}`,
          );
      });
    expect(offenders).toEqual([]);
  });
});
