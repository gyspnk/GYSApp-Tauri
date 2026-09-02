import { useLayoutEffect, useRef, useState } from "react";
import type { ChordDocumentV2 } from "@gys/contracts";
import type { ChordLayoutPage } from "./chord-layout-pdf.js";
import {
  chordFillColor,
  chordTextColor,
  readChordUiPrefs,
  subscribeChordUiPrefs,
  type ChordUiPrefs,
} from "./chord-ui-prefs.js";
import { getAccentColor, subscribeAccentColor } from "./accent-color.js";

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

/** Return the chromatic pitch class for a canonical or ASCII key spelling. */
export function chordKeyIndex(value: string): number | undefined {
  const normalized = value.trim().replace("♯", "#").replace("♭", "b");
  return NOTE_INDEX.get(normalized);
}

type ParsedChordRoot = { family: string; root: string };

const NUMBERED_CHORD_ROOTS: Record<string, string> = {
  "1": "C",
  "2": "D",
  "3": "E",
  "4": "F",
  "5": "G",
  "6": "A",
  "7": "B",
};

function parseChordRoot(value: string): ParsedChordRoot | undefined {
  const match = value.trim().match(/^([A-Ga-g1-7])([#♯b♭]?)(min|m(?!aj))?/);
  if (!match) return undefined;
  const root = `${NUMBERED_CHORD_ROOTS[match[1]!] ?? match[1]!.toUpperCase()}${(
    match[2] ?? ""
  )
    .replace("♯", "#")
    .replace("♭", "b")}`;
  if (chordKeyIndex(root) === undefined) return undefined;
  return { root, family: `${root}${match[3] ? "m" : ""}` };
}

/**
 * Canonical gyschordweb note-aligned documents omit an explicit key. Mirror
 * its family-chord resolver: first/last roots establish a tonic when they
 * agree; otherwise a repeated resolving last root wins, then frequency.
 */
export function inferChordDocumentKey(
  document: ChordDocumentV2,
): string | undefined {
  if ("key" in document) return document.key;
  const pages = Object.entries(document.pages).sort(
    ([left], [right]) => Number(left) - Number(right),
  );
  const roots = pages.flatMap(([, entries]) =>
    [...entries]
      .sort((left, right) => left.noteIdx - right.noteIdx)
      .map((entry) => parseChordRoot(entry.chord))
      .filter((entry): entry is ParsedChordRoot => entry !== undefined),
  );
  if (roots.length === 0) return undefined;

  const first = roots[0]!;
  const last = roots.at(-1)!;
  if (first.family === last.family) return first.root;

  const counts = new Map<string, number>();
  let mostFrequent = first;
  let max = 0;
  for (const entry of roots) {
    const count = (counts.get(entry.family) ?? 0) + 1;
    counts.set(entry.family, count);
    if (count > max) {
      max = count;
      mostFrequent = entry;
    }
  }
  return (counts.get(last.family) ?? 0) > 1 ? last.root : mostFrequent.root;
}

/** Select a stable user-facing spelling without changing the pitch class. */
export function chordKeyName(
  index: number,
  accidental: "sharp" | "flat" = "sharp",
): string {
  const notes = accidental === "flat" ? FLAT_NOTES : SHARP_NOTES;
  return notes[((Math.trunc(index) % 12) + 12) % 12] ?? "C";
}

/**
 * Compute the shortest chromatic transpose from source key to target key.
 * The result stays inside the viewer's documented -6..+6 boundary.
 */
export function transposeBetweenKeys(
  source: number | string,
  target: number | string,
): number {
  const sourceIndex =
    typeof source === "number" ? source : chordKeyIndex(source);
  const targetIndex =
    typeof target === "number" ? target : chordKeyIndex(target);
  if (sourceIndex === undefined || targetIndex === undefined) return 0;
  return ((((targetIndex - sourceIndex + 6) % 12) + 12) % 12) - 6;
}

export type ChordTextLine = {
  text: string;
  chords: Array<{ token: string; index: number }>;
};

export type ChordTextCharRect = {
  index: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export type ChordVisualRow = {
  /** Offset from the text line's top, in CSS pixels. */
  top: number;
  /** Relative left offset inside the text line (0..1). */
  left: number;
  /** Relative width inside the text line (0..1). */
  width: number;
  markers: Array<{ token: string; index: number; position: number }>;
};

type ChordTextLineRect = {
  left: number;
  width: number;
  top?: number;
};

function clampUnit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function roundedPosition(value: number): number {
  return Math.round(clampUnit(value) * 10_000) / 10_000;
}

/**
 * Keep chord markers attached to the visual line produced by browser wrapping.
 *
 * gyschordweb performs this mapping after measuring the rendered lyric text.
 * The helper is deliberately DOM-free so the same behavior can be tested and
 * the React presentation can rerun it from a ResizeObserver without touching
 * the PDF/chord source data.
 */
export function groupChordMarkersByVisualRow(
  text: string,
  chords: Array<{ token: string; index: number }>,
  charRects: ChordTextCharRect[],
  lineRect: ChordTextLineRect,
): ChordVisualRow[] {
  if (chords.length === 0) return [];
  const textLength = [...text].length;
  const left = Number.isFinite(lineRect.left) ? lineRect.left : 0;
  const width = Math.max(
    1,
    Number.isFinite(lineRect.width) ? lineRect.width : 1,
  );
  const top = Number.isFinite(lineRect.top) ? (lineRect.top ?? 0) : 0;
  const validRects = charRects
    .filter(
      (rect) =>
        Number.isInteger(rect.index) &&
        rect.index >= 0 &&
        rect.index < textLength &&
        Number.isFinite(rect.left) &&
        Number.isFinite(rect.right) &&
        Number.isFinite(rect.top),
    )
    .sort((a, b) => a.index - b.index);

  if (validRects.length === 0) {
    return [
      {
        top: 0,
        left: 0,
        width: 1,
        markers: chords.map((chord) => ({
          token: chord.token,
          index: chord.index,
          position: roundedPosition(chord.index / Math.max(1, textLength - 1)),
        })),
      },
    ];
  }

  const groups: Array<{ top: number; rects: ChordTextCharRect[] }> = [];
  for (const rect of validRects) {
    const group = groups.find(
      (candidate) => Math.abs(candidate.top - rect.top) < 2,
    );
    if (group) group.rects.push(rect);
    else groups.push({ top: rect.top, rects: [rect] });
  }
  groups.sort((a, b) => a.top - b.top);

  const rows = groups.map((group) => {
    const rowLeft = Math.min(...group.rects.map((rect) => rect.left));
    const rowRight = Math.max(...group.rects.map((rect) => rect.right));
    return {
      top: group.top - top,
      left: clampUnit((rowLeft - left) / width),
      width: clampUnit(Math.max(1, rowRight - rowLeft) / width),
      rowLeft,
      rowWidth: Math.max(1, rowRight - rowLeft),
      rects: group.rects,
      markers: [] as ChordVisualRow["markers"],
    };
  });

  const rectByIndex = new Map(validRects.map((rect) => [rect.index, rect]));
  for (const chord of chords) {
    const index = Math.max(0, Math.min(textLength, Math.trunc(chord.index)));
    const direct = rectByIndex.get(index);
    const fallback =
      direct ??
      rectByIndex.get(Math.max(0, Math.min(textLength - 1, index - 1))) ??
      validRects[validRects.length - 1];
    if (!fallback) continue;
    const targetX = direct ? (direct.left + direct.right) / 2 : fallback.right;
    let row = rows.find(
      (candidate) => Math.abs(candidate.top - (fallback.top - top)) < 2,
    );
    if (!row)
      row = rows.find(
        (candidate) =>
          targetX >= candidate.rowLeft - 1 &&
          targetX <= candidate.rowLeft + candidate.rowWidth + 1,
      );
    if (!row) {
      row = rows.reduce((closest, candidate) =>
        Math.abs(candidate.rowLeft - targetX) <
        Math.abs(closest.rowLeft - targetX)
          ? candidate
          : closest,
      );
    }
    row.markers.push({
      token: chord.token,
      index: chord.index,
      position: roundedPosition((targetX - row.rowLeft) / row.rowWidth),
    });
  }

  return rows
    .filter((row) => row.markers.length > 0)
    .map(({ top: rowTop, left: rowLeft, width: rowWidth, markers }) => ({
      top: Math.max(0, rowTop),
      left: rowLeft,
      width: Math.max(0.01, rowWidth),
      markers,
    }));
}

function normalizeText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .trim();
}

/**
 * PDF and catalog lyrics often prefix a line with a verse/refrain label. The
 * canonical viewer removes that label before matching so the same chorded
 * PDF row can be reused by a differently formatted lyrics pack.
 */
function stripVerseLabel(value: string): string {
  return value.replace(
    /^\s*(?:reff?|refrain|chorus|ulangan|[(（]?[0-9]+[)）]?[.\s]*)+/i,
    "",
  );
}

function chordLineScore(target: string, candidate: string): number {
  if (!target || !candidate) return 0;
  if (candidate === target) return 1;
  if (candidate.includes(target) || target.includes(candidate)) {
    const ratio =
      Math.min(candidate.length, target.length) /
      Math.max(candidate.length, target.length);
    return 0.85 * ratio;
  }
  let prefix = 0;
  while (
    prefix < candidate.length &&
    prefix < target.length &&
    candidate[prefix] === target[prefix]
  )
    prefix += 1;
  return prefix / Math.max(candidate.length, target.length);
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
    const target = normalizeText(stripVerseLabel(line));
    if (!target) return undefined;
    let bestIndex = -1;
    let bestScore = 0;
    candidates.forEach((candidate, index) => {
      if (used.has(index)) return;
      const source = normalizeText(stripVerseLabel(candidate.text));
      const score = chordLineScore(target, source);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    if (bestIndex < 0 || bestScore < 0.6) return undefined;
    used.add(bestIndex);
    const matched = candidates[bestIndex];
    if (!matched) return undefined;
    // gyschordweb parity: keep the APP's lyric text (the catalog can differ
    // from the chord document) and only take the chord tokens from the
    // document. Re-map indices against the rendered string so markers land on
    // the right syllables even when the two texts differ.
    const chords = matched.chords
      .map((chord) => ({
        token: chord.token,
        index: remapChordIndex(chord.index, matched.text, line),
      }))
      .filter((chord) => chord.index >= 0 && chord.index <= line.length);
    return { text: line, chords };
  });
}

/**
 * Convert a chord index measured against the document line to an index against
 * the app lyric line. When the texts differ, falls back to a proportional
 * position so chords still land near the correct syllable.
 */
function remapChordIndex(
  documentIndex: number,
  documentText: string,
  appText: string,
): number {
  const clamped = Math.max(
    0,
    Math.min(documentText.length, Math.round(documentIndex)),
  );
  const docNormalized = normalizeText(stripVerseLabel(documentText));
  const appNormalized = normalizeText(stripVerseLabel(appText));
  if (docNormalized && appNormalized) {
    const fraction =
      docNormalized.length > 0
        ? Math.min(1, clamped / Math.max(1, docNormalized.length))
        : 0;
    return Math.round(fraction * appNormalized.length);
  }
  const fraction =
    documentText.length > 0
      ? Math.min(1, clamped / Math.max(1, documentText.length))
      : 0;
  return Math.round(fraction * appText.length);
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
  const textRef = useRef<HTMLSpanElement>(null);
  const chars = [...line.text];
  const [visualRows, setVisualRows] = useState<ChordVisualRow[]>(() =>
    groupChordMarkersByVisualRow(line.text, line.chords, [], {
      left: 0,
      width: 1,
    }),
  );

  useLayoutEffect(() => {
    const textElement = textRef.current;
    if (!textElement) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const bounds = textElement.getBoundingClientRect();
      const rects = Array.from(
        textElement.querySelectorAll<HTMLElement>("[data-chord-char-index]"),
      ).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          index: Number(element.dataset.chordCharIndex),
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        } satisfies ChordTextCharRect;
      });
      setVisualRows(
        groupChordMarkersByVisualRow(line.text, line.chords, rects, {
          left: bounds.left,
          width: bounds.width,
          top: bounds.top,
        }),
      );
    };
    const schedule = () => {
      if (frame) return;
      frame =
        typeof window.requestAnimationFrame === "function"
          ? window.requestAnimationFrame(measure)
          : window.setTimeout(measure, 0);
    };
    schedule();
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(schedule)
        : undefined;
    observer?.observe(textElement);
    return () => {
      observer?.disconnect();
      if (frame) {
        if (typeof window.cancelAnimationFrame === "function")
          window.cancelAnimationFrame(frame);
        else window.clearTimeout(frame);
      }
    };
  }, [line.chords, line.text]);

  return (
    <span className="chord-rich-line">
      <span className="chord-text-layer" ref={textRef}>
        {chars.map((character, index) => (
          <span
            className="chord-text-char"
            data-chord-char-index={index}
            key={`${index}-${character}`}
          >
            {character === " " ? " " : character}
          </span>
        ))}
      </span>
      {visualRows.map((row, rowIndex) => (
        <span
          className="chord-visual-row"
          key={`row-${rowIndex}`}
          aria-hidden="true"
          style={{
            left: `${row.left * 100}%`,
            top: `${row.top}px`,
            width: `${row.width * 100}%`,
          }}
        >
          {row.markers.map((marker) => (
            <small
              className="chord-visual-marker"
              key={`${marker.index}-${marker.token}`}
              style={{ left: `${marker.position * 100}%` }}
            >
              {transposeChord(marker.token, transpose, accidental)}
            </small>
          ))}
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
  const [prefs, setPrefs] = useState<ChordUiPrefs>(() => readChordUiPrefs());
  const [accent, setAccent] = useState(() => getAccentColor());
  useLayoutEffect(
    () => subscribeChordUiPrefs(() => setPrefs(readChordUiPrefs())),
    [],
  );
  useLayoutEffect(
    () => subscribeAccentColor(() => setAccent(getAccentColor())),
    [],
  );
  if (!visible) return null;
  const textColor = chordTextColor(prefs, accent);
  const fillColor = chordFillColor(prefs, accent);
  const fillStyle =
    prefs.fill === "none"
      ? "transparent"
      : `color-mix(in srgb, ${fillColor} ${
          prefs.fill === "solid" ? "65%" : "32%"
        }, #ffffff)`;
  return (
    <span
      className="chord-capability"
      aria-label="Chord layer"
      style={
        {
          "--chord-text-color": textColor,
          "--chord-fill-background": fillStyle,
          "--chord-fill-opacity": `${prefs.fillOpacityPercent}%`,
          "--chord-font-scale": prefs.fontOverridePercent / 100,
          "--chord-fill-padding-scale": prefs.fillPaddingPercent / 100,
        } as React.CSSProperties
      }
    >
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
