/** `bytes 0-0/90868320` -> 90868320; anything else -> undefined. */
export function parseContentRangeTotal(
  value: string | null,
): number | undefined {
  if (!value) return undefined;
  const total = value.trim().match(/^bytes\s+\d+-\d+\/(\d+)$/i)?.[1];
  if (!total) return undefined;
  const bytes = Number(total);
  return Number.isFinite(bytes) && bytes > 0 ? bytes : undefined;
}

/**
 * Asks for a single byte so the proxy reports the whole document size without
 * transferring it. Any failure yields undefined, which the caller treats as
 * "unknown size".
 */
export async function fetchPdfTotalBytes(
  url: string,
  fetcher: typeof fetch = fetch,
): Promise<number | undefined> {
  try {
    const response = await fetcher(url, { headers: { range: "bytes=0-0" } });
    const total = parseContentRangeTotal(response.headers.get("content-range"));
    await response.body?.cancel().catch(() => {});
    return total;
  } catch {
    return undefined;
  }
}
