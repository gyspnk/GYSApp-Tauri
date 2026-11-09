/**
 * Runtime schema access without paying for zod in the first paint.
 *
 * The entry graph used to import five modules that pulled `@gys/contracts`
 * (and therefore zod, ~28 KiB gzip) synchronously, so the shell could not
 * paint before the validator arrived. Every one of those call sites runs
 * inside an async fetch path already, so the schemas are loaded there and the
 * module graph stays split.
 */
let pending: Promise<typeof import("@gys/contracts")> | null = null;

export function loadContracts() {
  pending ??= import("@gys/contracts");
  return pending;
}
