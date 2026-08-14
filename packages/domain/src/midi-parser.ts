import type { NormalizedMidi, RawMidi, RawMidiEvent } from "./index.js";

class Cursor {
  public offset = 0;
  public constructor(private readonly bytes: Uint8Array) {}
  public remaining(): number {
    return this.bytes.byteLength - this.offset;
  }
  public u8(): number {
    const value = this.bytes[this.offset++];
    if (value === undefined) throw new Error("truncated MIDI data");
    return value;
  }
  public u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  public u32(): number {
    return (
      this.u8() * 0x1000000 + (this.u8() << 16) + (this.u8() << 8) + this.u8()
    );
  }
  public bytesOf(length: number): Uint8Array {
    if (length < 0 || this.remaining() < length)
      throw new Error("truncated MIDI data");
    const value = this.bytes.slice(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
  public variableLength(): number {
    let value = 0;
    for (let count = 0; count < 4; count += 1) {
      const byte = this.u8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error("invalid MIDI variable-length quantity");
  }
}

function ascii(bytes: Uint8Array): string {
  return String.fromCharCode(...bytes);
}

function parseTrack(bytes: Uint8Array): {
  channel: number;
  events: RawMidiEvent[];
  tempo?: number;
} {
  const cursor = new Cursor(bytes);
  const events: RawMidiEvent[] = [];
  let tick = 0;
  let runningStatus: number | undefined;
  let channel = 0;
  let tempo: number | undefined;
  while (cursor.remaining() > 0) {
    tick += cursor.variableLength();
    let status = cursor.u8();
    if (status < 0x80) {
      if (runningStatus === undefined)
        throw new Error("MIDI running status without a status byte");
      cursor.offset -= 1;
      status = runningStatus;
    } else if (status < 0xf0) {
      runningStatus = status;
      channel = status & 0x0f;
    }
    const command = status & 0xf0;
    if (command === 0x80 || command === 0x90) {
      const note = cursor.u8();
      const velocity = cursor.u8();
      if (note > 127 || velocity > 127)
        throw new Error("invalid MIDI note data");
      if (command === 0x90 && velocity > 0)
        events.push({ tick, type: "noteOn", note, velocity, channel });
      else events.push({ tick, type: "noteOff", note, channel });
    } else if (command === 0xc0) {
      const program = cursor.u8();
      if (program > 127) throw new Error("invalid MIDI program");
      events.push({ tick, type: "program", program, channel });
    } else if (status === 0xff) {
      const metaType = cursor.u8();
      const length = cursor.variableLength();
      const payload = cursor.bytesOf(length);
      if (metaType === 0x51 && payload.byteLength === 3) {
        const micros = (payload[0]! << 16) | (payload[1]! << 8) | payload[2]!;
        if (micros > 0) tempo = 60_000_000 / micros;
      }
      if (metaType === 0x2f) break;
    } else if (status === 0xf0 || status === 0xf7) {
      cursor.bytesOf(cursor.variableLength());
    } else if (status >= 0xf0) {
      const dataLength =
        status === 0xf1 || status === 0xf3 ? 1 : status === 0xf2 ? 2 : 0;
      cursor.bytesOf(dataLength);
    } else {
      cursor.bytesOf(command === 0xd0 ? 1 : 2);
    }
  }
  return tempo === undefined ? { channel, events } : { channel, events, tempo };
}

export class MidiParser {
  public parse(bytes: Uint8Array): RawMidi {
    const cursor = new Cursor(bytes);
    if (ascii(cursor.bytesOf(4)) !== "MThd")
      throw new Error("MIDI header is missing");
    const headerLength = cursor.u32();
    if (headerLength < 6) throw new Error("invalid MIDI header length");
    const format = cursor.u16();
    const trackCount = cursor.u16();
    const division = cursor.u16();
    if (format > 2 || trackCount === 0)
      throw new Error("unsupported MIDI format");
    if (headerLength > 6) cursor.bytesOf(headerLength - 6);
    const ppq = division & 0x8000 ? 480 : Math.max(1, division & 0x7fff);
    const tracks: RawMidi["tracks"] = [];
    let tempo = 120;
    for (let index = 0; index < trackCount; index += 1) {
      if (ascii(cursor.bytesOf(4)) !== "MTrk")
        throw new Error("MIDI track header is missing");
      const length = cursor.u32();
      const parsed = parseTrack(cursor.bytesOf(length));
      tracks.push({ channel: parsed.channel, events: parsed.events });
      if (parsed.tempo) tempo = parsed.tempo;
    }
    return { ppq, tempo, tracks };
  }
}

export type MidiParserResult = NormalizedMidi;
