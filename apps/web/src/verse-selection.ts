/** Human label for a set of verse numbers: `1–3, 7, 9–10`. */
export function formatVerseNumbers(verses: readonly number[]): string {
  const sorted = [...new Set(verses)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | undefined;
  let end: number | undefined;
  const flush = () => {
    if (start === undefined) return;
    parts.push(
      end !== undefined && end !== start ? `${start}–${end}` : `${start}`,
    );
    start = undefined;
    end = undefined;
  };
  for (const verse of sorted) {
    if (start === undefined) {
      start = verse;
      end = undefined;
      continue;
    }
    if (verse === (end ?? start) + 1) {
      end = verse;
      continue;
    }
    flush();
    start = verse;
  }
  flush();
  return parts.join(", ");
}
