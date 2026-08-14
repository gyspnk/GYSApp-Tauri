import { describe, expect, it } from "vitest";
import { MidiSession, RenderCache, type MidiAudioBackend } from "./midi.js";

function backend(events: string[]): MidiAudioBackend {
  return {
    load: async () => {
      events.push("load");
    },
    play: async (position) => {
      events.push(`play:${position}`);
    },
    pause: async () => {
      events.push("pause");
    },
    stop: async () => {
      events.push("stop");
    },
    seek: async (position) => {
      events.push(`seek:${position}`);
    },
    setVolume: async (volume) => {
      events.push(`volume:${volume}`);
    },
    setTempo: async (tempo) => {
      events.push(`tempo:${tempo}`);
    },
    setTranspose: async (transpose) => {
      events.push(`transpose:${transpose}`);
    },
  };
}

describe("MidiSession", () => {
  it("keeps transport state coherent across load, play, pause, seek, and stop", async () => {
    const events: string[] = [];
    const session = new MidiSession(backend(events));
    await session.load({
      id: "hymn-001",
      duration: 180,
      sourceHash: "a".repeat(64),
    });
    await session.play();
    await session.pause();
    await session.seek(999);
    await session.stop();
    expect(events).toEqual(["load", "play:0", "pause", "seek:180", "stop"]);
    expect(session.snapshot()).toMatchObject({
      status: "stopped",
      position: 180,
      duration: 180,
    });
  });

  it("clamps tempo, transpose, and volume while exposing mute as a separate state", async () => {
    const events: string[] = [];
    const session = new MidiSession(backend(events));
    await session.load({
      id: "hymn-001",
      duration: 10,
      sourceHash: "b".repeat(64),
    });
    await session.setTempo(500);
    await session.setTranspose(-99);
    await session.setVolume(2);
    session.setMuted(true);
    expect(session.snapshot()).toMatchObject({
      tempo: 220,
      transpose: -24,
      volume: 1,
      muted: true,
    });
    expect(events).toContain("tempo:220");
    expect(events).toContain("transpose:-24");
    expect(events).toContain("volume:1");
  });
});

describe("RenderCache", () => {
  it("evicts least recently used unpinned renders under the 96 MB cap", async () => {
    const cache = new RenderCache(10);
    await cache.put("a", new Uint8Array(6));
    await cache.put("b", new Uint8Array(4));
    await cache.pin("a", true);
    await cache.put("c", new Uint8Array(4));
    expect(await cache.get("a")).toBeDefined();
    expect(await cache.get("b")).toBeUndefined();
    expect(await cache.get("c")).toBeDefined();
  });
});
