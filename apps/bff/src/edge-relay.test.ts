import { describe, expect, it, vi } from "vitest";
import {
  buildEdgeSsml,
  collectEdgeAudio,
  edgeAudioChunk,
  type EdgeSocket,
} from "./edge-relay.js";

const request = {
  text: "Pujilah Allah <yang esa> & benar",
  voice: "id-ID-GadisNeural",
  rate: 0.9,
  pitch: 1,
  volume: 1,
};

function fakeSocket() {
  const sent: string[] = [];
  let onMessage: (data: string | ArrayBuffer) => void = () => undefined;
  let onClose: (reason?: string) => void = () => undefined;
  const socket: EdgeSocket = {
    send: (data) => sent.push(data),
    close: () => undefined,
    onMessage: (listener) => {
      onMessage = listener;
    },
    onClose: (listener) => {
      onClose = listener;
    },
  };
  return {
    socket,
    sent,
    audio: (payload: Uint8Array) => {
      const header = new TextEncoder().encode('{"Path":"audio"}');
      const frame = new Uint8Array(2 + header.length + payload.length);
      frame[0] = (header.length >> 8) & 0xff;
      frame[1] = header.length & 0xff;
      frame.set(header, 2);
      frame.set(payload, 2 + header.length);
      onMessage(frame.buffer);
    },
    end: () => onMessage("X-RequestId:1\r\nPath:turn.end\r\n\r\n"),
    fail: (reason?: string) => onClose(reason),
  };
}

describe("Edge relay", () => {
  it("escapes the text and keeps the neutral prosody", () => {
    const ssml = buildEdgeSsml(request);
    expect(ssml).toContain("Pujilah Allah &lt;yang esa&gt; &amp; benar");
    expect(ssml).toContain("rate='-10%'");
    expect(ssml).toContain("pitch='+0%'");
    expect(ssml).toContain("voice name='id-ID-GadisNeural'");
  });

  it("reads the header length of a binary packet", () => {
    const payload = new Uint8Array([1, 2, 3, 4]);
    const header = new TextEncoder().encode('{"Path":"audio"}');
    const frame = new Uint8Array(2 + header.length + payload.length);
    frame.set([(header.length >> 8) & 0xff, header.length & 0xff]);
    frame.set(header, 2);
    frame.set(payload, 2 + header.length);
    expect(Array.from(edgeAudioChunk(frame.buffer)!)).toEqual([1, 2, 3, 4]);
    expect(edgeAudioChunk(new Uint8Array([1]).buffer)).toBeUndefined();
  });

  it("sends the config and ssml frames, then joins the audio", async () => {
    const relay = fakeSocket();
    const pending = collectEdgeAudio(relay.socket, request, { nowMs: 0 });
    expect(relay.sent[0]).toContain("Path:speech.config");
    expect(relay.sent[1]).toContain("Path:ssml");
    relay.audio(new Uint8Array([7, 8]));
    relay.audio(new Uint8Array([9]));
    relay.end();
    expect(Array.from(new Uint8Array(await pending))).toEqual([7, 8, 9]);
  });

  it("refuses an empty or closed stream", async () => {
    const empty = fakeSocket();
    const pending = collectEdgeAudio(empty.socket, request, { nowMs: 0 });
    empty.end();
    await expect(pending).rejects.toThrow("returned no audio");

    const closed = fakeSocket();
    const waiting = collectEdgeAudio(closed.socket, request, { nowMs: 0 });
    closed.fail("handshake refused");
    await expect(waiting).rejects.toThrow("handshake refused");
  });

  it("gives up on silence", async () => {
    vi.useFakeTimers();
    const silent = fakeSocket();
    const pending = collectEdgeAudio(silent.socket, request, {
      nowMs: 0,
      timeoutMs: 50,
    });
    const assertion = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    vi.useRealTimers();
  });
});
