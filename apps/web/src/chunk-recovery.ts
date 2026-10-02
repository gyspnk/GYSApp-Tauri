/**
 * A stale code chunk must not evict verified music, downloaded packages or
 * editorial snapshots. Their integrity and lifecycle belong to their stores.
 */
export async function clearStaleShellCaches(
  storage: Pick<CacheStorage, "keys" | "delete">,
): Promise<void> {
  const names = await storage.keys();
  await Promise.allSettled(
    names
      .filter((name) => name.startsWith("gysapp-shell-"))
      .map((name) => storage.delete(name)),
  );
}
