import { describe, expect, it } from "vitest";
import { MidiParser } from "./midi-parser.js";

function chunk(name: string, bytes: number[]): number[] {
  return [
    ...name.split("").map((char) => char.charCodeAt(0)),
    (bytes.length >>> 24) & 0xff,
    (bytes.length >>> 16) & 0xff,
    (bytes.length >>> 8) & 0xff,
    bytes.length & 0xff,
    ...bytes,
  ];
}

describe("MidiParser", () => {
  it("parses tempo, running status, programs, and note events", () => {
    const track = [
      0x00, 0xc0, 0x0c, 0x00, 0x90, 0x3c, 0x64, 0x81, 0x70, 0x3c, 0x00, 0x00,
      0xff, 0x51, 0x03, 0x07, 0xa1, 0x20, 0x00, 0xff, 0x2f, 0x00,
    ];
    const bytes = new Uint8Array([
      ...[..."MThd"].map((char) => char.charCodeAt(0)),
      0,
      0,
      0,
      6,
      0,
      0,
      0,
      1,
      1,
      0xe0,
      ...chunk("MTrk", track),
    ]);
    const parsed = new MidiParser().parse(bytes);
    expect(parsed.ppq).toBe(480);
    expect(parsed.tempo).toBe(120);
    expect(parsed.tracks[0]?.events).toEqual([
      { tick: 0, type: "program", program: 12, channel: 0 },
      { tick: 0, type: "noteOn", note: 60, velocity: 100, channel: 0 },
      { tick: 240, type: "noteOff", note: 60, channel: 0 },
    ]);
  });

  it("rejects malformed or truncated files", () => {
    expect(() => new MidiParser().parse(new Uint8Array([1, 2, 3]))).toThrow(
      "truncated",
    );
  });
});
