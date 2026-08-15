import type { ChordDocumentV2 } from "@gys/contracts";
import type { ChordLayoutPage } from "./chord-layout-pdf.js";

const SHARP_NOTES = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
const FLAT_NOTES = [
  "C",
  "D♭",
  "D",
  "E♭",
  "E",
  "F",
  "G♭",
  "G",
  "A♭",
  "A",
  "B♭",
  "B",
];
const NOTE_INDEX = new Map([
  ...SHARP_NOTES.map((note, index) => [note, index] as const),
  ...FLAT_NOTES.map((note, index) => [note, index] as const),
  ["C#", 1],
  ["D#", 3],
  ["F#", 6],
  ["G#", 8],
  ["A#", 10],
  ["Db", 1],
  ["Eb", 3],
  ["Gb", 6],
  ["Ab", 8],
  ["Bb", 10],
]);

export type ChordTextLine = {
  text: string;
  chords: Array<{ token: string; index: number }>;
};

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

function transposeRoot(
  root: string,
  offset: number,
  accidental: "sharp" | "flat",
) {
  const index = NOTE_INDEX.get(root);
  if (index === undefined) return root;
  const notes = accidental === "flat" ? FLAT_NOTES : SHARP_NOTES;
  return notes[(((index + offset) % 12) + 12) % 12] ?? root;
}

/** Musically transpose both the chord root and an optional slash-bass root. */
export function transposeChord(
  chord: string,
  offset: number,
  accidental: "sharp" | "flat" = "sharp",
): string {
  if (!offset) return chord;
  return chord.replace(
    /(^|\/)([A-G](?:#|♯|b|♭)?)/g,
    (match, prefix: string, root: string) =>
      `${prefix}${transposeRoot(root, offset, accidental)}`,
  );
}

/**
 * Associate the canonical PDF-derived lyric lines with the app's verse text.
 * The association is intentionally conservative: an unmatched line receives
 * no chord rather than borrowing a chord from another verse.
 */
export function matchChordLinesToLyrics(
  lyricLines: string[],
  document: ChordDocumentV2 | undefined,
  layout: ChordLayoutPage[],
  verseIndex: number,
): Array<ChordTextLine | undefined> {
  if (!document) return lyricLines.map(() => undefined);
  const candidates: ChordTextLine[] =
    "verses" in document
      ? (document.verses[verseIndex]?.lines ?? []).map((line) => ({
          text: line.text,
          chords: line.chords,
        }))
      : layout.flatMap((page) =>
          page.lines.map((line) => ({
            text: line.text,
            chords: line.chords.map((chord) => ({
              token: chord.chord,
              index: Math.max(0, Math.round(chord.pos * line.text.length)),
            })),
          })),
        );
  const used = new Set<number>();
  return lyricLines.map((line) => {
    const target = normalizeText(line);
    if (!target) return undefined;
    let bestIndex = -1;
    let bestScore = 0;
    candidates.forEach((candidate, index) => {
      if (used.has(index)) return;
      const source = normalizeText(candidate.text);
      if (!source) return;
      const score =
        source === target
          ? 1
          : source.includes(target) || target.includes(source)
            ? Math.min(source.length, target.length) /
              Math.max(source.length, target.length)
            : 0;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0 || bestScore < 0.55) return undefined;
    used.add(bestIndex);
    return candidates[bestIndex];
  });
}

function ChordLine({
  line,
  transpose,
  accidental,
}: {
  line: ChordTextLine;
  transpose: number;
  accidental: "sharp" | "flat";
}) {
  const chars = [...line.text];
  const byIndex = new Map<number, string[]>();
  for (const chord of line.chords) {
    const index = Math.max(0, Math.min(chars.length, chord.index));
    const current = byIndex.get(index) ?? [];
    current.push(transposeChord(chord.token, transpose, accidental));
    byIndex.set(index, current);
  }
  return (
    <span className="chord-rich-line">
      {chars.map((character, index) => (
        <span className="chord-aligned-cell" key={`${index}-${character}`}>
          <small>{(byIndex.get(index) ?? []).join(" ")}</small>
          <span>{character === " " ? " " : character}</span>
        </span>
      ))}
      {(byIndex.get(chars.length) ?? []).map((chord) => (
        <span className="chord-aligned-cell" key={`tail-${chord}`}>
          <small>{chord}</small>
          <span> </span>
        </span>
      ))}
    </span>
  );
}

/** Shared chord capability for Text presentation. */
export function ChordCapability({
  lines,
  transpose = 0,
  accidental = "sharp",
}: {
  lines: Array<ChordTextLine | undefined>;
  transpose?: number;
  accidental?: "sharp" | "flat";
}) {
  const visible = lines.some((line) => line && line.chords.length > 0);
  if (!visible) return null;
  return (
    <span className="chord-capability" aria-label="Chord layer">
      {lines.map((line, index) =>
        line && line.chords.length > 0 ? (
          <ChordLine
            key={`${index}-${line.text}`}
            line={line}
            transpose={transpose}
            accidental={accidental}
          />
        ) : null,
      )}
    </span>
  );
}
