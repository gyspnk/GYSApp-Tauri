import { describe, expect, it } from "vitest";
import { MidiRenderCache, type RenderedPcm } from "./midi-render-cache.js";

const sample: RenderedPcm = {
  sampleRate: 44_100,
  left: Float32Array.from([0, 0.25, -0.5]),
  right: Float32Array.from([0.1, 0.2, 0.3]),
};

describe("MidiRenderCache", () => {
  it("round-trips PCM renders by an immutable render key", async () => {
    const cache = new MidiRenderCache(1024);

    await cache.put("source:soundfont:tempo:transpose:instrument:rate", sample);

    expect(
      await cache.get("source:soundfont:tempo:transpose:instrument:rate"),
    ).toEqual(sample);
    expect(await cache.get("other-key")).toBeUndefined();
  });

  it("evicts old unpinned renders at the byte cap", async () => {
    const cache = new MidiRenderCache(48);
    await cache.put("first", sample);
    await cache.put("second", {
      sampleRate: sample.sampleRate,
      left: new Float32Array(4),
      right: new Float32Array(4),
    });

    expect(await cache.get("first")).toBeUndefined();
    expect(await cache.get("second")).toBeDefined();
  });

  it("checks warm renders without decoding or duplicating channel buffers", async () => {
    const cache = new MidiRenderCache(1024);
    await cache.put("warm", sample);
    expect(cache.has("warm")).toBe(true);
    expect(cache.has("missing")).toBe(false);
    expect(cache.stats().bytes).toBe(24);
    expect(await cache.get("warm")).toEqual(sample);
  });

  it("retains the active buffer while neighbours replace each other, then evicts it after release", async () => {
    const cache = new MidiRenderCache(48);
    const active = {
      length: 3,
      numberOfChannels: 2,
      sampleRate: sample.sampleRate,
      getChannelData: (channel: number) =>
        channel === 0 ? sample.left : sample.right,
    } as AudioBuffer;
    cache.putAudioBuffer("active", active, true);
    await cache.put("first-neighbour", sample);
    await cache.put("second-neighbour", sample);
    expect(cache.getAudioBuffer("active")).toBe(active);
    expect(cache.has("first-neighbour")).toBe(false);
    expect(cache.has("second-neighbour")).toBe(true);
    expect(cache.stats().bytes).toBe(48);

    await cache.pin("active", false);
    cache.has("second-neighbour");
    await cache.put("third-neighbour", sample);
    expect(cache.has("active")).toBe(false);
    expect(cache.stats().bytes).toBe(48);
  });

  it("copies public input/output while sharing worker-owned PCM with materialization", async () => {
    const cache = new MidiRenderCache(128);
    const input = {
      ...sample,
      left: sample.left.slice(),
      right: sample.right.slice(),
    };
    await cache.put("copied", input);
    input.left[0] = 1;
    const output = (await cache.get("copied"))!;
    output.right[0] = 1;
    expect(await cache.get("copied")).toEqual(sample);

    await cache.putOwned("owned", sample);
    expect(cache.readPcm("owned")).toBe(sample);
    const buffer = {
      sampleRate: sample.sampleRate,
      length: sample.left.length,
      numberOfChannels: 2,
      getChannelData: (channel: number) =>
        channel === 0 ? sample.left : sample.right,
    } as AudioBuffer;
    cache.putAudioBuffer("owned", buffer);
    expect(cache.getAudioBuffer("owned")).toBe(buffer);
    expect(cache.stats().bytes).toBe(48);
    expect(await cache.get("owned")).toEqual(sample);
  });
});
