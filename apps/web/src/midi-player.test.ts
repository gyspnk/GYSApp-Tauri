import { describe, expect, it } from "vitest";
import { MidiOperationGate } from "./midi-player.js";

describe("MIDI operation generation", () => {
  it("invalidates late work when a newer operation starts", () => {
    const gate = new MidiOperationGate();
    const first = gate.next();
    const second = gate.next();

    expect(gate.isCurrent(first)).toBe(false);
    expect(gate.isCurrent(second)).toBe(true);
  });

  it("keeps a generation stable while an operation is still active", () => {
    const gate = new MidiOperationGate();
    const generation = gate.next();

    expect(gate.isCurrent(generation)).toBe(true);
    expect(gate.isCurrent(generation + 1)).toBe(false);
  });
});
