import { describe, expect, it } from "vitest";
import {
  buildChordedLines,
  extractLyricLines,
  extractPageNotes,
  NOTE_IDX_AFTER,
  NOTE_IDX_BEFORE,
  resolveChordMarker,
  type PdfTextItem,
} from "./chord-layout.js";

function item(
  str: string,
  x: number,
  y: number,
  width: number,
  fontSize = 10,
): PdfTextItem {
  return {
    str,
    x,
    y,
    width,
    fontSize,
  };
}

describe("canonical PDF chord layout", () => {
  it("splits multi-character notation and keeps note indices row-ordered", () => {
    const result = extractPageNotes(
      [
        item("1 . 2", 10, 90, 30),
        item("3", 50, 90, 8),
        item("4", 10, 70, 8, 8),
        item("Lagu", 10, 110, 40, 14),
      ],
      100,
      120,
    );

    expect(result.notes.map((note) => note.str)).toEqual(["1", ".", "2", "3"]);
    expect(result.notes.map((note) => note.idx)).toEqual([0, 1, 2, 3]);
    expect(result.noteRows).toEqual([
      { rowIndex: 0, y: 90, firstIdx: 0, lastIdx: 3 },
    ]);
    expect(result.notes[0]?.xPct).toBeCloseTo(13);
  });

  it("maps note indices to the nearest lyric line and preserves relative position", () => {
    const notes = extractPageNotes(
      [
        item("1", 20, 90, 8),
        item("2", 60, 90, 8),
        item("Lihatlah", 20, 70, 48, 14),
      ],
      100,
      120,
    );
    const lyricLines = extractLyricLines(
      [item("Lihatlah", 20, 70, 48, 14)],
      100,
    );

    const lines = buildChordedLines(notes.notes, notes.noteRows, lyricLines, [
      { noteIdx: 0, chord: "C" },
      { noteIdx: 1, chord: "G" },
    ]);

    expect(lines).toHaveLength(1);
    expect(lines[0]?.text).toBe("Lihatlah");
    expect(lines[0]?.chords[0]?.pos).toBeCloseTo(1 / 12);
    expect(lines[0]?.chords[1]?.pos).toBeCloseTo(11 / 12);
  });

  it("ignores digit-only text and rows with fewer than two notes", () => {
    const result = extractPageNotes(
      [item("1", 10, 90, 8), item("2", 20, 90, 8), item("9", 30, 70, 8)],
      100,
      120,
    );
    const lyrics = extractLyricLines(
      [item("1 2", 10, 90, 20), item("A", 10, 70, 8)],
      100,
    );

    expect(result.notes).toHaveLength(2);
    expect(lyrics.map((line) => line.text)).toEqual(["A"]);
  });

  it("resolves canonical intro and outro chord sentinels", () => {
    const notes = extractPageNotes(
      [item("1", 20, 90, 8), item("2", 60, 90, 8)],
      100,
      120,
    ).notes;

    expect(resolveChordMarker(notes, NOTE_IDX_BEFORE)?.xPct).toBeCloseTo(21.5);
    expect(resolveChordMarker(notes, NOTE_IDX_AFTER)?.xPct).toBeCloseTo(66.5);
    expect(resolveChordMarker(notes, 999_998)).toBeDefined();
  });
});
