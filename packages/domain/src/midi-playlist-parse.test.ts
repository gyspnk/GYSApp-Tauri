import { describe, expect, it } from "vitest";
import { MidiPlaylistSchema } from "@gys/contracts";
import { parseMidiPlaylist } from "./midi-playlist-parse.js";

const item = { songId: "hymn-001", title: "One" };

describe("parseMidiPlaylist", () => {
  it("fills the same defaults as the schema", () => {
    const parsed = parseMidiPlaylist({ version: 1, items: [item] });
    expect(parsed).toEqual(
      MidiPlaylistSchema.parse({ version: 1, items: [item] }),
    );
    expect(parsed).toMatchObject({
      currentIndex: 0,
      loop: "off",
      shuffle: false,
      autoNext: true,
      autoNextMode: "off",
      crossfadeMs: 0,
    });
  });

  it("drops unknown keys like the schema does", () => {
    const value = {
      version: 1,
      items: [{ ...item, extra: "x" }],
      future: true,
    };
    expect(parseMidiPlaylist(value)).toEqual(MidiPlaylistSchema.parse(value));
    expect(Object.keys(parseMidiPlaylist(value))).not.toContain("future");
  });

  it.each([
    ["missing version", { items: [] }],
    ["wrong version", { version: 2, items: [] }],
    ["items not an array", { version: 1, items: {} }],
    ["item without title", { version: 1, items: [{ songId: "a" }] }],
    ["unknown loop", { version: 1, items: [], loop: "sometimes" }],
    ["negative index", { version: 1, items: [], currentIndex: -1 }],
    ["fractional index", { version: 1, items: [], currentIndex: 1.5 }],
    ["crossfade too long", { version: 1, items: [], crossfadeMs: 10_001 }],
    ["bad digest", { version: 1, items: [{ ...item, sourceHash: "abc" }] }],
    ["not an object", "playlist"],
  ])("rejects %s", (_name, value) => {
    expect(() => parseMidiPlaylist(value)).toThrow();
    expect(() => MidiPlaylistSchema.parse(value)).toThrow();
  });

  it("accepts a valid digest and keeps it", () => {
    const sourceHash = "a".repeat(64);
    const parsed = parseMidiPlaylist({
      version: 1,
      items: [{ ...item, sourceHash }],
    });
    expect(parsed.items[0]?.sourceHash).toBe(sourceHash);
  });

  it("keeps an explicit currentIndex past the end, like the schema", () => {
    const value = { version: 1, items: [item], currentIndex: 4 };
    expect(parseMidiPlaylist(value).currentIndex).toBe(4);
    expect(MidiPlaylistSchema.parse(value).currentIndex).toBe(4);
  });
});
