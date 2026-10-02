import { memo, useMemo } from "react";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createTextHighlighter(query: string) {
  const terms = query.trim().split(/\s+/).filter(Boolean).map(escapeRegExp);
  if (!terms.length) return (text: string): React.ReactNode[] => [text];
  const matcher = new RegExp(`(${terms.join("|")})`, "ig");
  const exactTerms = terms.map((term) => new RegExp(`^${term}$`, "i"));
  return (text: string): React.ReactNode[] =>
    text
      .split(matcher)
      .map((part, index) =>
        exactTerms.some((term) => term.test(part)) ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      );
}

export function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const highlight = useMemo(() => createTextHighlighter(query), [query]);
  return <>{highlight(text)}</>;
}

function decodeBibleEntityLocal(value: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    nbsp: " ",
    quot: '"',
    lt: "<",
    gt: ">",
  };
  return value.replace(
    /&(?:#(\d+)|#x([0-9a-f]+)|([a-z][a-z0-9]+));/gi,
    (whole, decimal: string, hexadecimal: string, name: string) => {
      const codePoint = decimal
        ? Number(decimal)
        : hexadecimal
          ? Number.parseInt(hexadecimal, 16)
          : undefined;
      if (
        codePoint !== undefined &&
        Number.isInteger(codePoint) &&
        codePoint >= 0 &&
        codePoint <= 0x10ffff
      )
        return String.fromCodePoint(codePoint);
      return name ? (named[name.toLowerCase()] ?? whole) : whole;
    },
  );
}

type VerseSegment = {
  text: string;
  isJesus?: boolean;
  isFootnote?: boolean;
  isItalic?: boolean;
  isPoetry?: boolean;
};

function parseBibleVerseSegments(raw: string): VerseSegment[] {
  const segments: VerseSegment[] = [];
  const stack: Array<
    Pick<VerseSegment, "isJesus" | "isFootnote" | "isItalic" | "isPoetry">
  > = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const style = stack.reduce(
      (acc, cur) => ({ ...acc, ...cur }),
      {} as Pick<
        VerseSegment,
        "isJesus" | "isFootnote" | "isItalic" | "isPoetry"
      >,
    );
    // footnote ⓐⓑ hidden completely — jangan push sama sekali
    if (style.isFootnote) {
      buffer = "";
      return;
    }
    const decoded = decodeBibleEntityLocal(buffer);
    segments.push({ text: decoded, ...style });
    buffer = "";
  };
  let i = 0;
  while (i < raw.length) {
    if (raw[i] === "<") {
      const end = raw.indexOf(">", i);
      if (end === -1) {
        buffer += raw[i];
        i += 1;
        continue;
      }
      const tagRaw = raw.slice(i + 1, end).trim();
      const isClosing = tagRaw.startsWith("/");
      const tagName = tagRaw
        .replace(/^\//, "")
        .split(/[\s\/]/, 1)[0]
        ?.toLowerCase();
      const isSelfClosing = tagRaw.endsWith("/") || tagName === "pb";
      flush();
      if (!isClosing && !isSelfClosing) {
        if (tagName === "j") stack.push({ isJesus: true });
        else if (tagName === "f") stack.push({ isFootnote: true });
        else if (tagName === "i") stack.push({ isItalic: true });
        else if (tagName === "t") stack.push({ isPoetry: true });
        else if (tagName === "br" || tagName === "p") {
          segments.push({ text: "\n" });
        }
      } else if (isClosing) {
        for (let s = stack.length - 1; s >= 0; s -= 1) {
          const cur = stack[s];
          if (!cur) continue;
          if (
            (tagName === "j" && cur.isJesus) ||
            (tagName === "f" && cur.isFootnote) ||
            (tagName === "i" && cur.isItalic) ||
            (tagName === "t" && cur.isPoetry)
          ) {
            stack.splice(s, 1);
            break;
          }
        }
        if (tagName === "t") {
          segments.push({ text: "\n" });
        }
      } else if (isSelfClosing) {
        if (tagName === "pb") segments.push({ text: "\n" });
        else if (tagName === "br") segments.push({ text: "\n" });
      }
      i = end + 1;
      continue;
    }
    if (raw[i] === "&") {
      const semi = raw.indexOf(";", i);
      if (semi !== -1 && semi - i <= 32) {
        buffer += raw.slice(i, semi + 1);
        i = semi + 1;
        continue;
      }
    }
    buffer += raw[i];
    i += 1;
  }
  flush();
  // Merge consecutive segments with same style and normalize spaces
  const merged: VerseSegment[] = [];
  for (const seg of segments) {
    if (seg.text === "\n") {
      merged.push(seg);
      continue;
    }
    const normalized = seg.text.replace(/\s+/g, " ");
    if (!normalized.trim()) continue;
    const last = merged[merged.length - 1];
    if (
      last &&
      last.text !== "\n" &&
      last.isJesus === seg.isJesus &&
      last.isFootnote === seg.isFootnote &&
      last.isItalic === seg.isItalic &&
      last.isPoetry === seg.isPoetry
    ) {
      last.text += normalized;
    } else {
      merged.push({ ...seg, text: normalized });
    }
  }
  // hapus <br> di awal/akhir yang bikin first line ter-enter sekali, dan rapikan dobel enter
  while (merged.length && merged[0]?.text === "\n") merged.shift();
  while (merged.length && merged[merged.length - 1]?.text === "\n")
    merged.pop();
  const compact: VerseSegment[] = [];
  for (const seg of merged) {
    if (seg.text === "\n" && compact[compact.length - 1]?.text === "\n")
      continue;
    compact.push(seg);
  }
  return compact;
}

function BibleVerseTextView({ raw, query }: { raw: string; query: string }) {
  const segments = useMemo(() => parseBibleVerseSegments(raw), [raw]);
  const highlight = useMemo(() => createTextHighlighter(query), [query]);
  if (!segments.length) return null;
  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.text === "\n") return <br key={`br-${idx}`} />;
        if (seg.isFootnote) return null;
        const highlighted = highlight(seg.text);
        // footnote ⓐⓑ hidden per request — gak tampak sama sekali
        if (seg.isJesus) {
          return (
            <span key={`seg-${idx}`} className="bible-jw">
              {highlighted}
            </span>
          );
        }
        if (seg.isPoetry) {
          return (
            <span key={`seg-${idx}`} className="bible-poetry">
              {highlighted}
            </span>
          );
        }
        if (seg.isItalic) {
          return (
            <em key={`seg-${idx}`} className="bible-italic">
              {highlighted}
            </em>
          );
        }
        return <span key={`seg-${idx}`}>{highlighted}</span>;
      })}
    </>
  );
}

// Text props stay stable when selection, bookmarks, notes, or speech state change.
export const BibleVerseText = memo(BibleVerseTextView);
