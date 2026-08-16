import { describe, expect, it } from "vitest";
import type { ChordDocumentV2, ChordRef } from "@gys/contracts";
import {
  MediaCoordinator,
  MemoryChordCache,
  type AudibleSession,
  normalizeMidi,
} from "./index.js";

const ref: ChordRef = {
  songId: "hymn-001",
  path: "assets/chords/001.json",
  sourceCommit: "a3d1ea7",
  size: 10,
  sha256: "a".repeat(64),
};

const document: ChordDocumentV2 = {
  version: 2,
  songId: "hymn-001",
  title: "Kasih Setia-Mu",
  key: "C",
  sourceCommit: "a3d1ea7",
  sourcePath: ref.path,
  verses: [],
};

describe("memory chord cache", () => {
  it("keeps pinned entries while evicting the least recently used entry", async () => {
    const cache = new MemoryChordCache(20);
    await cache.putAtomic(ref, document, new Uint8Array(10));
    await cache.putAtomic(
      { ...ref, songId: "hymn-002", path: "assets/chords/002.json" },
      { ...document, songId: "hymn-002" },
      new Uint8Array(10),
    );
    await cache.pin("hymn-001", true);
    await cache.putAtomic(
      { ...ref, songId: "hymn-003", path: "assets/chords/003.json" },
      { ...document, songId: "hymn-003" },
      new Uint8Array(10),
    );

    expect(await cache.get("hymn-001")).toEqual(document);
    expect(await cache.get("hymn-002")).toBeUndefined();
    expect((await cache.stats()).bytes).toBe(20);
  });
});

describe("media coordinator", () => {
  it("pauses the prior audible session and never auto-resumes it", async () => {
    const events: string[] = [];
    const midi: AudibleSession = {
      kind: "midi",
      id: "m1",
      pause: async () => {
        events.push("midi.pause");
      },
      stop: async () => {
        events.push("midi.stop");
      },
    };
    const speech: AudibleSession = {
      kind: "speech",
      id: "s1",
      pause: async () => {
        events.push("speech.pause");
      },
      stop: async () => {
        events.push("speech.stop");
      },
    };
    const coordinator = new MediaCoordinator();

    await coordinator.start(midi);
    await coordinator.start(speech);

    expect(events).toEqual(["midi.pause"]);
    expect(coordinator.active()).toEqual(speech);
  });
});

describe("MIDI normalization", () => {
  it("sorts events, clamps tempo, and preserves program/percussion data", () => {
    const result = normalizeMidi({
      ppq: 480,
      tempo: 500,
      tracks: [
        {
          events: [
            { tick: 240, type: "noteOff", note: 60 },
            { tick: 0, type: "program", program: 12 },
            { tick: 0, type: "noteOn", note: 60, velocity: 100, channel: 9 },
          ],
          channel: 9,
        },
      ],
    });

    expect(result.tempo).toBe(220);
    expect(result.events.map((event) => event.tick)).toEqual([0, 0, 240]);
    expect(result.events[0]?.type).toBe("program");
    expect(result.events[1]?.channel).toBe(9);
  });
});
