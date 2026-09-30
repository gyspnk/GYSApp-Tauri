/** Never report a successful test when spawning failed or a signal killed it. */
export function processExitCode(result) {
  if (result.error || result.signal) return 1;
  return typeof result.status === "number" ? result.status : 1;
}
