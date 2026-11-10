/**
 * How much of the browser's storage budget this origin has already used.
 *
 * The offline pack row can say how big a download is, but only the platform
 * knows how much room is left. `navigator.storage.estimate()` is the one honest
 * source; when it is missing or answers nonsense the caller shows a plain
 * "unknown" line instead of a made-up number.
 */
export type StorageUsage = { used: number; quota: number };

export type StorageEstimate = () => Promise<
  { usage?: number; quota?: number } | undefined
>;

export async function readStorageUsage(
  estimate:
    StorageEstimate | undefined = globalThis.navigator?.storage?.estimate?.bind(
    globalThis.navigator.storage,
  ),
): Promise<StorageUsage | null> {
  if (!estimate) return null;
  try {
    const answer = await estimate();
    const used = answer?.usage;
    const quota = answer?.quota;
    if (!Number.isFinite(used) || !Number.isFinite(quota)) return null;
    if ((quota as number) <= 0) return null;
    return { used: used as number, quota: quota as number };
  } catch {
    return null;
  }
}
