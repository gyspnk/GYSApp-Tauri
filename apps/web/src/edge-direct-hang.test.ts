import { describe, expect, it, vi } from "vitest";
import {
  synthesizeEdgeDirect,
  type EdgeSocket,
  type EdgeSocketMessage,
} from "./edge-direct-safe.js";

const REQUEST = {
  text: "Uji koneksi suara",
  voice: "id-ID-GadisNeural",
  rate: 1,
  pitch: 1,
  volume: 1,
};

const DEPENDENCIES = {
  now: () => 1_789_084_800_000,
  randomId: () => "0123456789abcdef0123456789abcdef",
};

function settleWithin<T>(promise: Promise<T>, milliseconds = 25) {
  return Promise.race<
    | { status: "resolved"; value: T }
    | { status: "rejected"; error: unknown }
    | { status: "pending" }
  >([
    promise.then(
      (value) => ({ status: "resolved" as const, value }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    ),
    new Promise((resolve) =>
      setTimeout(() => resolve({ status: "pending" as const }), milliseconds),
    ),
  ]);
}

describe("direct Edge transport hang hardening", () => {
  it("aborts while the native WebSocket connect call is still pending", async () => {
    const connect = vi.fn(
      () => new Promise<EdgeSocket>(() => undefined),
    );
    const controller = new AbortController();
    const speech = synthesizeEdgeDirect(
      REQUEST,
      { ...DEPENDENCIES, connect },
      controller.signal,
    );

    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    controller.abort();

    const outcome = await settleWithin(speech);
    expect(outcome.status).toBe("rejected");
    if (outcome.status === "rejected") {
      expect(outcome.error).toMatchObject({ name: "AbortError" });
    }
  });

  it("returns completed audio without waiting for a stalled disconnect handshake", async () => {
    const listeners = new Set<(message: EdgeSocketMessage) => void>();
    const socket: EdgeSocket = {
      addListener(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      send: vi.fn(async () => undefined),
      disconnect: vi.fn(() => new Promise<void>(() => undefined)),
    };
    const speech = synthesizeEdgeDirect(REQUEST, {
      ...DEPENDENCIES,
      connect: vi.fn(async () => socket),
    });

    await vi.waitFor(() => expect(socket.send).toHaveBeenCalledTimes(2));

    const header = new TextEncoder().encode(
      "Path:audio\r\nContent-Type:audio/mpeg\r\n\r\n",
    );
    const frame = new Uint8Array(2 + header.length + 2);
    frame[0] = (header.length >> 8) & 0xff;
    frame[1] = header.length & 0xff;
    frame.set(header, 2);
    frame.set([7, 9], 2 + header.length);
    for (const listener of listeners) {
      listener({ type: "Binary", data: Array.from(frame) });
      listener({ type: "Text", data: "Path:turn.end\r\n\r\n{}" });
    }

    const outcome = await settleWithin(speech);
    expect(outcome.status).toBe("resolved");
    if (outcome.status === "resolved") {
      expect(Array.from(new Uint8Array(await outcome.value.arrayBuffer()))).toEqual([
        7, 9,
      ]);
    }
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });
});
