import { describe, expect, it } from "vitest";
import { chordStartupSyncAllowed } from "./chord-sync-gate.js";

function storage(value: string | null) {
  return { getItem: () => value };
}

describe("chordStartupSyncAllowed", () => {
  it("waits for the reader to open the songbook", () => {
    expect(chordStartupSyncAllowed(storage(null), {})).toBe(false);
  });

  it("runs after a visit on a normal connection", () => {
    expect(chordStartupSyncAllowed(storage("1"), {})).toBe(true);
    expect(
      chordStartupSyncAllowed(storage("1"), {
        connection: { effectiveType: "4g" },
      }),
    ).toBe(true);
  });

  it("skips metered and slow connections", () => {
    expect(
      chordStartupSyncAllowed(storage("1"), { connection: { saveData: true } }),
    ).toBe(false);
    for (const effectiveType of ["slow-2g", "2g", "3g"])
      expect(
        chordStartupSyncAllowed(storage("1"), {
          connection: { effectiveType },
        }),
      ).toBe(false);
  });

  it("stays off when storage is unavailable", () => {
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(chordStartupSyncAllowed(broken, {})).toBe(false);
  });
});
