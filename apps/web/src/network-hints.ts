type ConnectionLike = { saveData?: boolean; effectiveType?: string };

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
  return /(^|-)2g$|(^|-)3g$/.test(connection.effectiveType ?? "");
}
