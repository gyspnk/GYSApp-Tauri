/**
 * Song ids are printed as "hymn-001", but members share and retype bare numbers
 * ("/kidung/51", "/kidung/51a"). Resolve those aliases so a hymn link from a
 * message or a printed bulletin still opens the hymn instead of a 404 panel.
 */
export function canonicalHymnId(value: string): string | undefined {
  const match = /^(\d{1,3})([a-z]?)$/i.exec(value);
  if (!match) return undefined;
  const [, number, suffix = ""] = match;
  return `hymn-${number!.padStart(3, "0")}${suffix.toUpperCase()}`;
}

/**
 * Some printed numbers are split into two hymns (051A/051B, 124A/124B), so the
 * plain number has no entry of its own. Point those links at the first part
 * instead of showing the not-found panel.
 */
export function splitHymnFallback(
  songId: string,
  ids: readonly string[],
): string | undefined {
  const match = /^hymn-(\d{3})$/.exec(songId);
  if (!match) return undefined;
  const base = `hymn-${match[1]}`;
  return ids.find((id) => id.startsWith(base) && /[A-Z]$/.test(id));
}
