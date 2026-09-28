import { describe, expect, it, vi } from "vitest";
import type { Message as TauriWebSocketMessage } from "@tauri-apps/plugin-websocket";
import {
  buildEdgeSpeechConfig,
  buildEdgeSsml,
  generateSecMsGec,
  parseEdgeAudioFrame,
  synthesizeEdgeDirect,
  TauriEdgeSocketAdapter,
  type EdgeSocket,
  type EdgeSocketMessage,
} from "./edge-direct.js";

const REQUEST = {
  text: "Kasih < Tuhan & sesama",
  voice: "id-ID-GadisNeural",
  rate: 1,
  pitch: 1,
  volume: 1,
};

describe("direct Edge-compatible TTS protocol", () => {
  it("maps Tauri WebSocket events and failures to the Edge socket interface", async () => {
    const listeners = new Set<(message: TauriWebSocketMessage) => void>();
    const sendError = new Error("send failed");
    const socket = {
      addListener(listener: (message: TauriWebSocketMessage) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      send: vi.fn(async () => {
        throw sendError;
      }),
      disconnect: vi.fn(async () => undefined),
    };
    const adapter = new TauriEdgeSocketAdapter(socket);
    const received: EdgeSocketMessage[] = [];
    adapter.addListener((message) => received.push(message));

    for (const message of [
      { type: "Text", data: "hello" },
      { type: "Binary", data: [1, 2] },
      { type: "Ping", data: [3] },
      { type: "Pong", data: [4] },
      { type: "Close", data: { code: 1000, reason: "done" } },
    ] satisfies TauriWebSocketMessage[]) {
      for (const listener of listeners) listener(message);
    }
    await expect(adapter.send("speech.config")).rejects.toBe(sendError);

    expect(received).toEqual([
      { type: "Text", data: "hello" },
      { type: "Binary", data: [1, 2] },
      { type: "Ping", data: [3] },
      { type: "Pong", data: [4] },
      { type: "Close", data: { code: 1000, reason: "done" } },
      { type: "Error", data: sendError },
    ]);
  });

  it("generates the current Sec-MS-GEC token deterministically", async () => {
    await expect(generateSecMsGec(1_789_084_800_000)).resolves.toBe(
      "2ADBFD1C94E1128BE5862C357DB61D730535143AE72A42D52313FB30EB038DB5",
    );
  });

  it("builds CRLF-delimited speech configuration and escaped SSML", () => {
    const timestamp =
      "Fri Sep 11 2026 00:00:00 GMT+0000 (Coordinated Universal Time)";
    const config = buildEdgeSpeechConfig(timestamp);
    expect(config).toContain("Path:speech.config\r\n\r\n");
    expect(config).toContain("audio-24khz-48kbitrate-mono-mp3");

    const ssml = buildEdgeSsml(
      REQUEST,
      "0123456789abcdef0123456789abcdef",
      timestamp,
    );
    expect(ssml).toContain("Path:ssml\r\n\r\n");
    expect(ssml).toContain(`X-Timestamp:${timestamp}Z`);
    expect(ssml).toContain("xmlns='http://www.w3.org/2001/10/synthesis'");
    expect(ssml).toContain("xml:lang='id-ID'");
    expect(ssml).toContain("voice name='id-ID-GadisNeural'");
    expect(ssml).toContain("Kasih &lt; Tuhan &amp; sesama");
  });

  it("extracts only audio payload from a binary Edge frame", () => {
    const headers = new TextEncoder().encode(
      "Path:audio\r\nContent-Type:audio/mpeg\r\n\r\n",
    );
    const bytes = new Uint8Array(2 + headers.length + 3);
    bytes[0] = (headers.length >> 8) & 0xff;
    bytes[1] = headers.length & 0xff;
    bytes.set(headers, 2);
    bytes.set([1, 2, 3], 2 + headers.length);
    expect(Array.from(parseEdgeAudioFrame(Array.from(bytes)) ?? [])).toEqual([
      1, 2, 3,
    ]);
  });

  it("collects audio until turn.end and disconnects cleanly", async () => {
    const listeners = new Set<(message: EdgeSocketMessage) => void>();
    const socket: EdgeSocket = {
      addListener(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      send: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    const connect = vi.fn(async () => socket);

    const promise = synthesizeEdgeDirect(REQUEST, {
      connect,
      now: () => 1_789_084_800_000,
      randomId: () => "0123456789abcdef0123456789abcdef",
    });
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    expect(socket.send).toHaveBeenNthCalledWith(
      2,
      expect.stringMatching(
        /X-Timestamp:\w{3} \w{3} \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT\+0000 \(Coordinated Universal Time\)Z\r\nPath:ssml/,
      ),
    );
    const header = new TextEncoder().encode(
      "Path:audio\r\nContent-Type:audio/mpeg\r\n\r\n",
    );
    const frame = new Uint8Array(2 + header.length + 2);
    frame[0] = (header.length >> 8) & 0xff;
    frame[1] = header.length & 0xff;
    frame.set(header, 2);
    frame.set([7, 9], 2 + header.length);
    for (const listener of listeners)
      listener({ type: "Binary", data: Array.from(frame) });
    for (const listener of listeners)
      listener({ type: "Text", data: "Path:turn.end\r\n\r\n{}" });

    const blob = await promise;
    expect(Array.from(new Uint8Array(await blob.arrayBuffer()))).toEqual([
      7, 9,
    ]);
    expect(socket.send).toHaveBeenCalledTimes(2);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("aborts the active native socket exactly once", async () => {
    const listeners = new Set<(message: EdgeSocketMessage) => void>();
    const socket: EdgeSocket = {
      addListener(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      send: vi.fn(async () => undefined),
      disconnect: vi.fn(async () => undefined),
    };
    const controller = new AbortController();
    const promise = synthesizeEdgeDirect(
      REQUEST,
      {
        connect: vi.fn(async () => socket),
        now: () => 1_789_084_800_000,
        randomId: () => "0123456789abcdef0123456789abcdef",
      },
      controller.signal,
    );
    await vi.waitFor(() => expect(socket.send).toHaveBeenCalled());
    controller.abort();
    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });
});
