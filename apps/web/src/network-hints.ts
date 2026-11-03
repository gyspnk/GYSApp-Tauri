type ConnectionLike = {
  saveData?: boolean;
  effectiveType?: string;
  /** Downlink estimate in megabits per second, when the browser exposes it. */
  downlink?: number;
};

/** True when the connection asks us to spend fewer bytes on an image. */
export function prefersSmallImages(
  navigatorLike:
    | { connection?: ConnectionLike | undefined }
    | undefined = typeof navigator === "undefined"
    ? undefined
    : (navigator as Navigator & { connection?: ConnectionLike }),
): boolean {
  const connection = navigatorLike?.connection;
  if (!connection) return false;
  if (connection.saveData === true) return true;
  if (/(^|-)2g$|(^|-)3g$/.test(connection.effectiveType ?? "")) return true;
  // A nominal "4g" label can still describe a link slower than 1.5 Mbps; past
  // that point a 690 KiB hero costs more than the detail it adds.
  return typeof connection.downlink === "number" && connection.downlink <= 1.5;
}
