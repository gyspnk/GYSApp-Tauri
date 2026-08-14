import { describe, expect, it } from "vitest";
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
});
