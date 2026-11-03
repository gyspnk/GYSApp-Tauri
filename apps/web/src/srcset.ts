type Candidate = { url: string; width: number };

function parse(srcSet: string): Candidate[] {
  return srcSet
    .split(",")
    .map((entry) => {
      const [url, descriptor] = entry.trim().split(/\s+/);
      const match = /^(\d+)w$/.exec(descriptor ?? "");
      if (!url || !match || !/^https?:\/\//.test(url)) return undefined;
      return { url, width: Number(match[1]) };
    })
    .filter((entry): entry is Candidate => Boolean(entry));
}

/**
 * Cheap candidate for metered or slow connections: the narrowest one that still
 * covers a phone-width hero, falling back to the absolute smallest.
 */
export function pickSmallCandidate(
  srcSet: string | undefined,
  minWidth = 300,
): string | undefined {
  if (!srcSet) return undefined;
  const sorted = parse(srcSet).sort((a, b) => a.width - b.width);
  return (sorted.find((entry) => entry.width >= minWidth) ?? sorted[0])?.url;
}
