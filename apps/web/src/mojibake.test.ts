import { describe, expect, it } from "vitest";

/**
 * Text that was UTF-8 decoded as Windows-1252 shows up as these sequences.
 * The settings copy was corrupted twice by an editor round-trip, so this guard
 * keeps the whole web source honest instead of trusting review.
 *
 * Files are read through Vite's raw glob so the check needs no Node types in
 * the browser tsconfig.
 */
const MOJIBAKE = /Ã|Â|â€|âœ|â†|ðŸ|\uFFFD/;
const SOURCES = import.meta.glob("./**/*.{ts,tsx,css,json}", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

describe("source encoding", () => {
  it("contains no double-encoded UTF-8 text", () => {
    const offenders = Object.entries(SOURCES)
      .filter(([path]) => !path.endsWith("mojibake.test.ts"))
      .flatMap(([path, text]) =>
        text
          .split("\n")
          .map((line, index) => ({ line, number: index + 1 }))
          .filter(({ line }) => MOJIBAKE.test(line))
          .map(({ line, number }) => `${path}:${number}: ${line.trim()}`),
      );
    expect(offenders).toEqual([]);
  });
});
