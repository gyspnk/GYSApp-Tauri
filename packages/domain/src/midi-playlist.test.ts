import { describe, expect, it } from "vitest";
import { MidiPlaylistController } from "./midi-playlist.js";

const first = { songId: "hymn-001", title: "One" };
const second = { songId: "hymn-002", title: "Two" };
const third = { songId: "hymn-003", title: "Three" };

describe("MidiPlaylistController", () => {
  it("supports CRUD, reorder, and round-trip export", () => {
    const playlist = new MidiPlaylistController();
    playlist.add(first);
    playlist.add(second);
    playlist.add(third, 1);
    playlist.reorder(2, 0);
    playlist.select(1);
    playlist.remove("hymn-001");
    const exported = playlist.export();
    const restored = new MidiPlaylistController();
    restored.import(exported);
    expect(restored.snapshot().items.map((item) => item.songId)).toEqual([
      "hymn-002",
      "hymn-003",
    ]);
    expect(restored.current()?.songId).toBe("hymn-003");
  });

  it("implements loop, shuffle, and previous/next boundaries", () => {
    const playlist = new MidiPlaylistController();
    playlist.add(first);
    playlist.add(second);
    playlist.select(1);
    expect(playlist.next()).toBeUndefined();
    playlist.setOptions({ loop: "all" });
    expect(playlist.next()?.songId).toBe("hymn-001");
    expect(playlist.previous()?.songId).toBe("hymn-002");
    playlist.setOptions({ shuffle: true });
    expect(playlist.next(0.99)?.songId).toBe("hymn-002");
    playlist.setOptions({ loop: "one", shuffle: false });
    expect(playlist.next()?.songId).toBe("hymn-002");
  });
});
