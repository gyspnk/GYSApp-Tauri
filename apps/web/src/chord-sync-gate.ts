/** Startup chord sync verifies ~250 files against the lock: it only pays off
 * after a reader has opened the songbook, and it must never run on a metered
 * connection where it would compete with the page the reader is looking at. */
export type StartupConnection = {
  saveData?: boolean;
  effectiveType?: string;
};

export function chordStartupSyncAllowed(
  storage: Pick<Storage, "getItem">,
  navigatorLike: { connection?: StartupConnection },
): boolean {
  let visited = false;
  try {
    visited = storage.getItem("gys-kidung-visited") === "1";
  } catch {
    return false;
  }
  if (!visited) return false;
  const connection = navigatorLike.connection;
  if (connection?.saveData) return false;
  return !/(^|-)2g$|(^|-)3g$/.test(connection?.effectiveType ?? "");
}
