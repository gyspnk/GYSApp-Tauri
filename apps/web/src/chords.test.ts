import { describe, expect, it } from "vitest";
import { chordSongIdFromPath } from "./chords.js";

describe("fallback chord identity", () => {
  it("keeps suffixed hymn keys available when the BFF is absent", () => {
    expect(chordSongIdFromPath("assets/chord/051A_Batu Zaman.json")).toBe(
      "hymn-051A",
    );
  });
});
