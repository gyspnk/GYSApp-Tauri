import { describe, expect, it } from "vitest";
import { ChordDocumentV2Schema } from "@gys/contracts";
import {
  chordKeyIndex,
  chordKeyName,
  matchChordLinesToLyrics,
  transposeBetweenKeys,
  transposeChord,
} from "./chord-viewer.js";

describe("shared chord capability", () => {
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

  it("maps only the matching verse lines and never borrows another line", () => {
    const document = ChordDocumentV2Schema.parse({
      version: 2,
      songId: "hymn-001",
      title: "Test",
      key: "C",
      sourceCommit: "cbc7d386",
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
});
