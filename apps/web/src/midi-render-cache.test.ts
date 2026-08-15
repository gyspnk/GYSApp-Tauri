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
    const cache = new MidiRenderCache(64);
    await cache.put("first", sample);
    await cache.put("second", {
      sampleRate: sample.sampleRate,
      left: new Float32Array(4),
      right: new Float32Array(4),
    });

    expect(await cache.get("first")).toBeUndefined();
    expect(await cache.get("second")).toBeDefined();
  });
});
