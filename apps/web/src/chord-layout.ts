/**
 * The note-aligned chord files contain note indexes, not character offsets.
 * This module reproduces the canonical PDF coordinate mapping used by
 * GYSChordWeb while keeping the PDF engine at the lazy application boundary.
 */

export type PdfTextItem = {
  str: string;
  x: number;
  y: number;
  width: number;
  fontSize: number;
};

export type PdfNote = PdfTextItem & {
  idx: number;
  xPct: number;
  yPct: number;
  rowY: number;
  rowIndex: number;
  isNote: boolean;
  isDot: boolean;
  isRest: boolean;
};

export type PdfNoteRow = {
  rowIndex: number;
  y: number;
  firstIdx: number;
  lastIdx: number;
};

export type PdfLyricLine = {
  y: number;
  text: string;
  startPct: number;
  widthPct: number;
};

export type ChordLayoutEntry = {
  noteIdx: number;
  chord: string;
};

export type ChordedLine = {
  text: string;
  chords: Array<{ chord: string; pos: number }>;
};

export type PageNotes = {
  notes: PdfNote[];
  pageWidth: number;
  pageHeight: number;
  noteRows: PdfNoteRow[];
};

const NOTE_TEXT = /^[0-7.\s]+$/;
const SINGLE_NOTE = /^[0-7.]$/;
const DIGIT_NOTE = /^[1-7]$/;

function dominantFontSize(items: PdfTextItem[]): number | undefined {
  const candidates = items.filter(
    (item) => NOTE_TEXT.test(item.str) && /[1-7]/.test(item.str),
  );
  if (candidates.length === 0) return undefined;
  const counts = new Map<number, number>();
  for (const item of candidates) {
    const rounded = Math.round(item.fontSize * 10) / 10;
    counts.set(rounded, (counts.get(rounded) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** Extracts music notation and stable note indexes from one PDF page. */
export function extractPageNotes(
  items: PdfTextItem[],
  pageWidth: number,
  pageHeight: number,
): PageNotes {
  const dominant = dominantFontSize(items);
  if (dominant === undefined)
    return { notes: [], pageWidth, pageHeight, noteRows: [] };

  const noteItems: PdfTextItem[] = [];
  for (const item of items.filter(
    (candidate) =>
      NOTE_TEXT.test(candidate.str) &&
      Math.abs(candidate.fontSize - dominant) < 1.5,
  )) {
    if (SINGLE_NOTE.test(item.str)) {
      noteItems.push(item);
      continue;
    }
    const chars = [...item.str];
    if (chars.length <= 1) {
      noteItems.push(item);
      continue;
    }
    const slotWidth = item.width / chars.length;
    for (const [index, character] of chars.entries()) {
      if (!/[0-7.]/.test(character)) continue;
      noteItems.push({
        ...item,
        str: character,
        x: item.x + index * slotWidth,
        width: slotWidth,
      });
    }
  }

  const rows: Array<{ y: number; items: PdfTextItem[] }> = [];
  for (const item of [...noteItems].sort((a, b) => b.y - a.y)) {
    const existing = rows.find((row) => Math.abs(row.y - item.y) < 2);
    if (existing) existing.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  const musicRows = rows.filter(
    (row) => row.items.filter((item) => DIGIT_NOTE.test(item.str)).length >= 2,
  );

  const notes: PdfNote[] = [];
  const noteRows: PdfNoteRow[] = [];
  musicRows.forEach((row, rowIndex) => {
    const rowItems = [...row.items].sort((a, b) => a.x - b.x);
    const firstIdx = notes.length;
    for (const item of rowItems) {
      const idx = notes.length;
      notes.push({
        ...item,
        idx,
        xPct: ((item.x + item.width / 2) / pageWidth) * 100,
        yPct: (1 - item.y / pageHeight) * 100,
        rowY: row.y,
        rowIndex,
        isNote: DIGIT_NOTE.test(item.str),
        isDot: item.str === ".",
        isRest: item.str === "0",
      });
    }
    noteRows.push({
      rowIndex,
      y: row.y,
      firstIdx,
      lastIdx: notes.length - 1,
    });
  });
  return { notes, pageWidth, pageHeight, noteRows };
}

/** Extract lyric rows while excluding the numeric notation rows. */
export function extractLyricLines(
  items: PdfTextItem[],
  pageWidth: number,
): PdfLyricLine[] {
  const lyricItems = items
    .map((item) => ({ ...item, str: item.str.trim() }))
    .filter((item) => item.str.length > 0 && !NOTE_TEXT.test(item.str));
  const rows: Array<{ y: number; items: PdfTextItem[] }> = [];
  for (const item of [...lyricItems].sort((a, b) => b.y - a.y)) {
    const existing = rows.find((row) => Math.abs(row.y - item.y) < 2);
    if (existing) existing.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .filter((row) => row.items.some((item) => /[A-Za-z]/.test(item.str)))
    .map((row) => {
      const sorted = [...row.items].sort((a, b) => a.x - b.x);
      const start = sorted[0]?.x ?? 0;
      const end = Math.max(...sorted.map((item) => item.x + item.width));
      return {
        y: row.y,
        text: sorted.map((item) => item.str).join(" "),
        startPct: (start / pageWidth) * 100,
        widthPct: Math.max(1, ((end - start) / pageWidth) * 100),
      };
    });
}

/** Map canonical note-index entries to lyric rows and relative x positions. */
export function buildChordedLines(
  notes: PdfNote[],
  noteRows: PdfNoteRow[],
  lyricLines: PdfLyricLine[],
  entries: ChordLayoutEntry[],
): ChordedLine[] {
  const output: ChordedLine[] = [];
  if (entries.length === 0) return output;
  for (const row of noteRows) {
    const lyric = lyricLines
      .filter((candidate) => candidate.y < row.y && row.y - candidate.y <= 45)
      .sort((a, b) => row.y - a.y - (row.y - b.y))[0];
    if (!lyric) continue;
    const chords: Array<{ chord: string; pos: number }> = [];
    for (const entry of entries) {
      if (
        !Number.isInteger(entry.noteIdx) ||
        entry.noteIdx < row.firstIdx ||
        entry.noteIdx > row.lastIdx
      )
        continue;
      const note = notes[entry.noteIdx];
      if (!note) continue;
      chords.push({
        chord: entry.chord,
        pos: Math.max(
          0,
          Math.min(1, (note.xPct - lyric.startPct) / lyric.widthPct),
        ),
      });
    }
    if (chords.length > 0) output.push({ text: lyric.text, chords });
  }
  return output;
}
