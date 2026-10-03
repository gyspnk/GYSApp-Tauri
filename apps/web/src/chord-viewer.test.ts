import { describe, expect, it } from "vitest";
import { ChordDocumentV2Schema } from "@gys/contracts";
import {
  chordKeyIndex,
  chordKeyName,
  groupChordMarkersByVisualRow,
  inferChordDocumentKey,
  matchChordLinesToLyrics,
  transposeBetweenKeys,
  transposeChord,
} from "./chord-viewer.js";

describe("shared chord capability", () => {
  it("preserves original character offsets including spaces and punctuation", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-001",
      title: "Offsets",
      key: "C",
      sourceCommit: "a3d1ea7",
      sourcePath: "assets/chord/test.json",
      verses: [
        {
          label: "1",
          lines: [
            { text: "Kudus, Allah!", chords: [{ token: "G", index: 7 }] },
          ],
        },
      ],
    });
    expect(
      matchChordLinesToLyrics(["Kudus, Allah!"], document, [], 0)[0]?.chords[0]
        ?.index,
    ).toBe(7);
    expect(
      matchChordLinesToLyrics(["1. Kudus Allah"], document, [], 0)[0]?.chords[0]
        ?.index,
    ).toBe(9);
  });

  it("keeps PDF chord positions geometric instead of treating them as character counts", () => {
    const rects = [
      { index: 0, left: 0, right: 80, top: 0, bottom: 20 },
      { index: 1, left: 80, right: 100, top: 0, bottom: 20 },
    ];
    const rows = groupChordMarkersByVisualRow(
      "Wi",
      [{ token: "G", index: 1, position: 0.5 }],
      rects,
      { left: 0, width: 100 },
    );
    expect(rows[0]?.markers[0]?.position).toBe(0.5);
    const wrapped = groupChordMarkersByVisualRow(
      "Wi",
      [{ token: "G", index: 1, position: 0.9 }],
      [rects[0]!, { ...rects[1]!, left: 0, right: 20, top: 30 }],
      { left: 0, width: 80 },
    );
    expect(wrapped[0]?.top).toBe(30);
    expect(wrapped[0]?.markers[0]?.position).toBe(0.5);
  });

  it("reuses the canonical melody by line for unmatched later stanzas", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      type: "note-aligned",
      pages: { "1": [{ noteIdx: 0, chord: "C" }] },
    });
    const layout = [
      {
        page: 1,
        lines: [{ text: "Kudus Allah", chords: [{ chord: "C", pos: 0.4 }] }],
      },
    ];
    const result = matchChordLinesToLyrics(
      ["Pujilah Tuhan"],
      document,
      layout,
      1,
      ["Kudus Allah", "Pujilah Tuhan"],
    );
    expect(result[0]?.chords[0]).toMatchObject({ token: "C", position: 0.4 });
    expect(
      matchChordLinesToLyrics(["Baris tanpa melodi"], document, layout, 0)[0],
    ).toBeUndefined();
  });

  it("transposes roots and slash basses musically with accidental preference", () => {
    expect(transposeChord("C/G", 2)).toBe("D/A");
    expect(transposeChord("Bb/F", 1, "sharp")).toBe("B/F♯");
    expect(transposeChord("C", -1, "flat")).toBe("B");
  });

  it("treats key selection as a bounded transpose from the source key", () => {
    expect(chordKeyIndex("E♭")).toBe(3);
    expect(transposeBetweenKeys("G", "C")).toBe(5);
    expect(transposeBetweenKeys("C", "F♯")).toBe(-6);
    expect(chordKeyName(6, "flat")).toBe("G♭");
  });

  it("mirrors gyschordweb family-root resolution for note-aligned documents", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      type: "note-aligned",
      pages: {
        "2": [{ noteIdx: 0, chord: "A" }],
        "1": [
          { noteIdx: -1, chord: "C" },
          { noteIdx: 2, chord: "E" },
          { noteIdx: 5, chord: "C" },
        ],
      },
    });

    expect(inferChordDocumentKey(document)).toBe("C");
  });

  it("prefers a repeated resolving last root over the frequency fallback", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      type: "note-aligned",
      pages: {
        "1": [
          { noteIdx: 0, chord: "1" },
          { noteIdx: 2, chord: "G" },
          { noteIdx: 4, chord: "G" },
        ],
      },
    });

    expect(inferChordDocumentKey(document)).toBe("G");
  });

  it("maps only the matching verse lines and never borrows another line", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-001",
      title: "Test",
      key: "C",
      sourceCommit: "a3d1ea7",
      sourcePath: "assets/chord/test.json",
      verses: [
        {
          label: "1",
          lines: [{ text: "Kudus Allah", chords: [{ token: "C", index: 0 }] }],
        },
      ],
    });
    const matched = matchChordLinesToLyrics(
      ["Kudus Allah", "Bait lain"],
      document,
      [],
      0,
    );
    expect(matched[0]?.chords[0]?.token).toBe("C");
    expect(matched[1]).toBeUndefined();
  });

  it("normalizes punctuation while keeping each canonical line one-to-one", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-002",
      title: "One to one",
      key: "G",
      sourceCommit: "a3d1ea7",
      sourcePath: "assets/chord/test.json",
      verses: [
        {
          label: "1",
          lines: [
            { text: "Ku bersyukur!", chords: [{ token: "G", index: 0 }] },
            { text: "Ku bersyukur", chords: [{ token: "C", index: 3 }] },
          ],
        },
      ],
    });

    const matched = matchChordLinesToLyrics(
      ["Ku bersyukur!", "Ku bersyukur", "Baris baru"],
      document,
      [],
      0,
    );

    expect(matched.map((line) => line?.chords[0]?.token)).toEqual([
      "G",
      "C",
      undefined,
    ]);
  });

  it("does not attach a short partial candidate to an unrelated lyric line", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-003",
      title: "Conservative matching",
      key: "C",
      sourceCommit: "a3d1ea7",
      sourcePath: "assets/chord/test.json",
      verses: [
        {
          label: "1",
          lines: [
            { text: "Damai sejahtera", chords: [{ token: "C", index: 0 }] },
          ],
        },
      ],
    });

    const matched = matchChordLinesToLyrics(
      ["Damai", "Damai di rumah-Mu"],
      document,
      [],
      0,
    );

    expect(matched[0]).toBeUndefined();
    expect(matched[1]).toBeUndefined();
  });

  it("matches canonical verse labels and conservative common-prefix lines", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-004",
      title: "Canonical labels",
      key: "C",
      sourceCommit: "a3d1ea7",
      sourcePath: "assets/chord/test.json",
      verses: [
        {
          label: "Reff",
          lines: [
            {
              text: "Reff: Tuhan pimpin kami",
              chords: [{ token: "F", index: 0 }],
            },
            { text: "Bersama melayani", chords: [{ token: "C", index: 0 }] },
          ],
        },
      ],
    });

    const matched = matchChordLinesToLyrics(
      ["Reff Tuhan pimpin kami", "Bersama melayani hari", "Tidak terkait"],
      document,
      [],
      0,
    );

    expect(matched.map((line) => line?.chords[0]?.token)).toEqual([
      "F",
      "C",
      undefined,
    ]);
  });

  it("keeps relative chord markers attached to the visual line after text wraps", () => {
    const rects = Array.from({ length: 10 }, (_, index) => ({
      index,
      left: (index % 5) * 10,
      right: (index % 5) * 10 + 10,
      top: index < 5 ? 0 : 20,
      bottom: index < 5 ? 16 : 36,
    }));

    const rows = groupChordMarkersByVisualRow(
      "ABCDEFGHIJ",
      [
        { token: "C", index: 1 },
        { token: "G", index: 7 },
      ],
      rects,
      { left: 0, width: 50 },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]?.markers).toEqual([{ token: "C", index: 1, position: 0.3 }]);
    expect(rows[1]?.markers).toEqual([{ token: "G", index: 7, position: 0.5 }]);
  });
});
