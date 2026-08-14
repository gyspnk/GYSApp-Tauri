import type { MidiSong } from "./midi.js";
import { normalizeMidi, type NormalizedMidi } from "./index.js";
import { MidiParser } from "./midi-parser.js";

export type MidiSource = {
  id: string;
  url: string;
  sourceHash: string;
  duration?: number;
};

export type MidiLoaderFetcher = (
  url: string,
  signal?: AbortSignal,
) => Promise<Uint8Array>;

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(hash)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export class MidiLoader {
  private readonly rawByHash = new Map<string, Uint8Array>();
  private readonly parsedByHash = new Map<string, NormalizedMidi>();
  private readonly parser: MidiParser;

  public constructor(
    parser = new MidiParser(),
    private readonly fetcher: MidiLoaderFetcher = async (url, signal) => {
      const response = await fetch(url, signal ? { signal } : {});
      if (!response.ok)
        throw new Error(`MIDI request failed: ${response.status}`);
      return new Uint8Array(await response.arrayBuffer());
    },
  ) {
    this.parser = parser;
  }

  public async load(
    source: MidiSource,
    signal?: AbortSignal,
  ): Promise<{ song: MidiSong; midi: NormalizedMidi }> {
    const cached = this.parsedByHash.get(source.sourceHash);
    if (cached)
      return {
        song: {
          id: source.id,
          duration: source.duration ?? 0,
          sourceHash: source.sourceHash,
        },
        midi: cached,
      };
    let raw = this.rawByHash.get(source.sourceHash);
    if (!raw) {
      raw = await this.fetcher(source.url, signal);
      const actual = await digest(raw);
      if (actual.toLowerCase() !== source.sourceHash.toLowerCase())
        throw new Error("MIDI source hash mismatch");
      this.rawByHash.set(source.sourceHash, raw.slice());
    }
    const midi = normalizeMidi(this.parser.parse(raw));
    this.parsedByHash.set(source.sourceHash, midi);
    return {
      song: {
        id: source.id,
        duration: source.duration ?? 0,
        sourceHash: source.sourceHash,
      },
      midi,
    };
  }

  public clearParsed(): void {
    this.parsedByHash.clear();
  }
  public rawStats(): { entries: number; bytes: number } {
    return {
      entries: this.rawByHash.size,
      bytes: [...this.rawByHash.values()].reduce(
        (sum, value) => sum + value.byteLength,
        0,
      ),
    };
  }
}
