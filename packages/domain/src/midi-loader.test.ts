import { describe, expect, it, vi } from "vitest";
import { MidiLoader } from "./midi-loader.js";

function midiBytes(): Uint8Array {
  const track = [0, 0xff, 0x2f, 0];
  return new Uint8Array([
    ...[..."MThd"].map((char) => char.charCodeAt(0)),
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    0xe0,
    ...[..."MTrk"].map((char) => char.charCodeAt(0)),
    0,
    0,
    0,
    track.length,
    ...track,
  ]);
}

async function hash(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

describe("MidiLoader", () => {
  it("bounds cached song count and retains recently used MIDI", async () => {
    const fetcher = vi.fn(async (url: string) => {
      const bytes = midiBytes();
      bytes[13] = Number(url.slice(1)) + 1;
      return bytes;
    });
    const loader = new MidiLoader(undefined, fetcher);
    const sources = [];
    for (let index = 0; index < 40; index++) {
      const bytes = midiBytes();
      bytes[13] = index + 1;
      const source = {
        id: String(index),
        url: `/${index}`,
        sourceHash: await hash(bytes),
      };
      sources.push(source);
      await loader.load(source);
    }
    expect(loader.rawStats().entries).toBeLessThanOrEqual(32);
    await loader.load(sources[39]!);
    expect(fetcher).toHaveBeenCalledTimes(40);
    await loader.load(sources[0]!);
    expect(fetcher).toHaveBeenCalledTimes(41);
  });

  it("plays an oversized valid file without keeping its raw bytes resident", async () => {
    const bytes = new Uint8Array(2 * 1024 * 1024 + 1);
    bytes.set(midiBytes());
    const loader = new MidiLoader(undefined, async () => bytes);
    const result = await loader.load({
      id: "oversized",
      url: "/large.mid",
      sourceHash: await hash(bytes),
    });
    expect(result.midi.ppq).toBe(480);
    expect(loader.rawStats().bytes).toBe(0);
  });

  it("reuses raw and parsed MIDI by source hash", async () => {
    const bytes = midiBytes();
    const sourceHash = await hash(bytes);
    let calls = 0;
    const loader = new MidiLoader(undefined, async () => {
      calls += 1;
      return bytes;
    });
    const source = { id: "hymn-001", url: "/001.mid", sourceHash };
    await loader.load(source);
    await loader.load({ ...source, id: "hymn-alias" });
    expect(calls).toBe(1);
    expect(loader.rawStats()).toEqual({ entries: 1, bytes: bytes.byteLength });
  });

  it("rejects a source whose bytes do not match its lock", async () => {
    const loader = new MidiLoader(undefined, async () => midiBytes());
    await expect(
      loader.load({ id: "bad", url: "/bad.mid", sourceHash: "a".repeat(64) }),
    ).rejects.toThrow("hash mismatch");
  });

  it("deduplicates simultaneous requests for the same immutable source", async () => {
    const bytes = midiBytes();
    const sourceHash = await hash(bytes);
    let calls = 0;
    const loader = new MidiLoader(undefined, async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 15));
      return bytes;
    });
    const source = { id: "hymn-001", url: "/001.mid", sourceHash };
    await Promise.all([
      loader.load(source),
      loader.load(source),
      loader.load(source),
    ]);
    expect(calls).toBe(1);
  });
  it("shares parsed work while preserving each caller's song identity and duration", async () => {
    const bytes = midiBytes();
    const sourceHash = await hash(bytes);
    let finish!: (bytes: Uint8Array) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<Uint8Array>((resolve) => {
          finish = resolve;
        }),
    );
    const loader = new MidiLoader(undefined, fetcher);
    const first = loader.load({
      id: "first",
      url: "/same.mid",
      sourceHash,
      duration: 15,
    });
    const second = loader.load({
      id: "alias",
      url: "/same.mid",
      sourceHash,
      duration: 30,
    });
    finish(bytes);
    const [a, b] = await Promise.all([first, second]);
    expect(a.song).toMatchObject({ id: "first", duration: 15 });
    expect(b.song).toMatchObject({ id: "alias", duration: 30 });
    expect(a.midi).toBe(b.midi);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cancels only the departing reader while another reader uses the shared fetch", async () => {
    const bytes = midiBytes();
    const sourceHash = await hash(bytes);
    let finish!: (bytes: Uint8Array) => void;
    let sharedSignal: AbortSignal | undefined;
    const loader = new MidiLoader(undefined, (_url, signal) => {
      sharedSignal = signal;
      return new Promise<Uint8Array>((resolve, reject) => {
        finish = resolve;
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const source = { id: "first", url: "/same.mid", sourceHash };
    const reader = new AbortController();
    const first = loader.load(source, reader.signal);
    const abandoned = expect(first).rejects.toMatchObject({
      name: "AbortError",
    });
    const second = loader.load({ ...source, id: "next" });
    reader.abort();
    await abandoned;
    expect(sharedSignal?.aborted).toBe(false);
    finish(bytes);
    expect((await second).song.id).toBe("next");
  });

  it("aborts unused work, allows retry, and rejects an already-aborted cache read", async () => {
    const bytes = midiBytes();
    const sourceHash = await hash(bytes);
    let calls = 0;
    let sharedSignal: AbortSignal | undefined;
    const loader = new MidiLoader(undefined, (_url, signal) => {
      calls++;
      sharedSignal = signal;
      if (calls > 1) return Promise.resolve(bytes);
      return new Promise<Uint8Array>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      });
    });
    const source = { id: "first", url: "/same.mid", sourceHash };
    const reader = new AbortController();
    const cancelled = expect(
      loader.load(source, reader.signal),
    ).rejects.toMatchObject({ name: "AbortError" });
    reader.abort();
    await cancelled;
    expect(sharedSignal?.aborted).toBe(true);
    expect((await loader.load(source)).song.id).toBe("first");
    await expect(loader.load(source, reader.signal)).rejects.toMatchObject({
      name: "AbortError",
    });
    expect(calls).toBe(2);
  });
});
