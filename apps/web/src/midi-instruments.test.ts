import { describe, expect, it } from "vitest";
import { GM_INSTRUMENTS, midiInstrumentLabel } from "./midi-instruments.js";

describe("GM MIDI instrument catalogue", () => {
  it("exposes every General MIDI program without a fabricated entry", () => {
    expect(GM_INSTRUMENTS).toHaveLength(128);
    expect(GM_INSTRUMENTS[0]).toBe("Acoustic Grand Piano");
    expect(GM_INSTRUMENTS[127]).toBe("Gunshot");
    expect(midiInstrumentLabel(-1)).toBe("Instrumen dari file");
    expect(midiInstrumentLabel(200)).toBe("Program 128");
  });
});
