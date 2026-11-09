import { describe, expect, it } from "vitest";
import {
  audioFromFrame,
  buildSsml,
  msGecToken,
  speechClockTicks,
  synthesizeEdgeSpeech,
} from "./edge-tts.js";

const audioFrame = (header: string, body: number[]) => {
  const head = new TextEncoder().encode(header);
  const frame = new Uint8Array(2 + head.byteLength + body.length);
  new DataView(frame.buffer).setUint16(0, head.byteLength);
  frame.set(head, 2);
  frame.set(new Uint8Array(body), 2 + head.byteLength);
  return frame.buffer;
};

describe("keyless Edge speech", () => {
  it("rounds the token clock to a five minute window", () => {
    const now = 1_700_000_000_000;
    expect(speechClockTicks(now)).toBe(speechClockTicks(now + 299_000));
    expect(speechClockTicks(now + 300_000)).toBe(
      speechClockTicks(now) + 300 * 10_000_000,
    );
    expect(speechClockTicks(now) % 10_000_000).toBe(0);
  });

  it("derives a stable upper-case token per window", async () => {
    const now = 1_700_000_000_000;
    const first = await msGecToken(now);
    expect(first).toMatch(/^[0-9A-F]{64}$/);
    expect(await msGecToken(now + 1000)).toBe(first);
    expect(await msGecToken(now + 300_000)).not.toBe(first);
  });

  it("carries the requested prosody into the SSML", () => {
    const ssml = buildSsml({
      text: 'Bacaan "hari" ini & besok',
      voice: "id-ID-GadisNeural",
      rate: 0.9,
      pitch: 1,
      volume: 1,
    });
    expect(ssml).toContain('<voice name="id-ID-GadisNeural">');
    expect(ssml).toContain('rate="-10%"');
    expect(ssml).toContain('pitch="+0Hz"');
    expect(ssml).toContain('volume="+0%"');
    expect(ssml).toContain("&quot;hari&quot;");
    expect(ssml).toContain("&amp; besok");
  });

  it("reads only the audio payload of a binary frame", () => {
    const frame = audioFrame(
      "X-RequestId:1\r\nContent-Type:audio/mpeg\r\nPath:audio\r\n",
      [73, 68, 51],
    );
    expect([...(audioFromFrame(frame) ?? [])]).toEqual([73, 68, 51]);
    const other = audioFrame("Path:turn.end\r\n", [1, 2, 3]);
    expect(audioFromFrame(other)).toBeUndefined();
    expect(audioFromFrame(new ArrayBuffer(1))).toBeUndefined();
  });

  it("stitches audio frames until the turn ends", async () => {
    type Listener = (event: { data: unknown }) => void;
    const listeners: Record<string, Listener[]> = {};
    const sent: string[] = [];
    const socket = {
      accept() {},
      close() {},
      addEventListener(type: string, listener: Listener) {
        (listeners[type] ??= []).push(listener);
      },
      send(payload: string) {
        sent.push(payload);
        if (!/Path:ssml/.test(payload)) return;
        setTimeout(() => {
          for (const listener of listeners.message ?? [])
            listener({ data: audioFrame("Path:audio\r\n", [1, 2]) });
          for (const listener of listeners.message ?? [])
            listener({ data: audioFrame("Path:audio\r\n", [3]) });
          for (const listener of listeners.message ?? [])
            listener({ data: "Path:turn.end\r\n" });
        }, 0);
      },
    };
    const audio = await synthesizeEdgeSpeech(
      {
        text: "Halo",
        voice: "id-ID-GadisNeural",
        rate: 0.9,
        pitch: 1,
        volume: 1,
      },
      { openSocket: async () => socket, now: 1_700_000_000_000 },
    );
    expect([...audio]).toEqual([1, 2, 3]);
    expect(sent.some((payload) => payload.includes("Path:speech.config"))).toBe(
      true,
    );
    expect(sent.some((payload) => payload.includes("Path:ssml"))).toBe(true);
  });

  it("fails loudly when the socket stays silent", async () => {
    const socket = {
      accept() {},
      close() {},
      addEventListener() {},
      send() {},
    };
    await expect(
      synthesizeEdgeSpeech(
        {
          text: "Halo",
          voice: "id-ID-GadisNeural",
          rate: 0.9,
          pitch: 1,
          volume: 1,
        },
        { openSocket: async () => socket, timeoutMs: 5 },
      ),
    ).rejects.toThrow("Edge speech timed out");
  });

  it("rejects a turn that ends without audio", async () => {
    type Listener = (event: { data: unknown }) => void;
    const listeners: Record<string, Listener[]> = {};
    const socket = {
      accept() {},
      close() {},
      addEventListener(type: string, listener: Listener) {
        (listeners[type] ??= []).push(listener);
      },
      send() {
        setTimeout(() => {
          for (const listener of listeners.message ?? [])
            listener({ data: "Path:turn.end\r\n" });
        }, 0);
      },
    };
    await expect(
      synthesizeEdgeSpeech(
        {
          text: "Halo",
          voice: "id-ID-GadisNeural",
          rate: 0.9,
          pitch: 1,
          volume: 1,
        },
        { openSocket: async () => socket },
      ),
    ).rejects.toThrow("Edge speech returned no audio");
  });
});
