import type { MidiSong } from "./midi.js";
import { normalizeMidi, type NormalizedMidi } from "./index.js";
import { MidiParser } from "./midi-parser.js";

export type MidiSource = {
  id: string;
  url: string;
  sourceHash: string;
  duration?: number;
  /** Optional bytes supplied by an asset cache, avoiding a second network read. */
  bytes?: Uint8Array;
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

type PendingMidi = {
  controller: AbortController;
  promise: Promise<NormalizedMidi>;
  consumers: number;
  settled: boolean;
};

const CACHE_ENTRIES = 32;
const RAW_CACHE_BYTES = 2 * 1024 * 1024;
// Conservative per-event allowance; caller-owned active models are separate.
const PARSED_CACHE_BYTES = 8 * 1024 * 1024;

function retainBounded<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  maxBytes: number,
  size: (value: T) => number,
): void {
  cache.delete(key);
  if (size(value) > maxBytes) return;
  cache.set(key, value);
  let bytes = [...cache.values()].reduce(
    (total, item) => total + size(item),
    0,
  );
  while (cache.size > CACHE_ENTRIES || bytes > maxBytes) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    bytes -= size(cache.get(oldest)!);
    cache.delete(oldest);
  }
}

export class MidiLoader {
  private readonly rawByHash = new Map<string, Uint8Array>();
  private readonly parsedByHash = new Map<string, NormalizedMidi>();
  private readonly inFlightByHash = new Map<string, PendingMidi>();
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
    signal?.throwIfAborted();
    let midi = this.parsedByHash.get(source.sourceHash);
    if (midi) {
      this.parsedByHash.delete(source.sourceHash);
      this.parsedByHash.set(source.sourceHash, midi);
      const raw = this.rawByHash.get(source.sourceHash);
      if (raw) {
        this.rawByHash.delete(source.sourceHash);
        this.rawByHash.set(source.sourceHash, raw);
      }
    }
    if (!midi) {
      let request = this.inFlightByHash.get(source.sourceHash);
      if (!request || request.controller.signal.aborted) {
        const controller = new AbortController();
        const fresh: PendingMidi = {
          controller,
          consumers: 0,
          settled: false,
          promise: this.loadFresh(source, controller.signal).finally(() => {
            fresh.settled = true;
            if (this.inFlightByHash.get(source.sourceHash) === fresh)
              this.inFlightByHash.delete(source.sourceHash);
          }),
        };
        this.inFlightByHash.set(source.sourceHash, fresh);
        request = fresh;
      }
      midi = await this.join(request, signal);
    }
    signal?.throwIfAborted();
    return {
      song: {
        id: source.id,
        duration: source.duration ?? 0,
        sourceHash: source.sourceHash,
      },
      midi,
    };
  }

  /** A departing reader cannot cancel another consumer of the same bytes. */
  private join(
    request: PendingMidi,
    signal?: AbortSignal,
  ): Promise<NormalizedMidi> {
    request.consumers++;
    return new Promise((resolve, reject) => {
      let active = true;
      const release = () => {
        if (!active) return false;
        active = false;
        signal?.removeEventListener("abort", cancel);
        request.consumers--;
        if (!request.consumers && !request.settled) request.controller.abort();
        return true;
      };
      const cancel = () => {
        if (release())
          reject(
            signal?.reason ??
              new DOMException("MIDI reader cancelled", "AbortError"),
          );
      };
      signal?.addEventListener("abort", cancel, { once: true });
      if (signal?.aborted) cancel();
      request.promise.then(
        (midi) => {
          if (release()) resolve(midi);
        },
        (error) => {
          if (release()) reject(error);
        },
      );
    });
  }

  private async loadFresh(
    source: MidiSource,
    signal: AbortSignal,
  ): Promise<NormalizedMidi> {
    let raw = this.rawByHash.get(source.sourceHash);
    if (!raw) {
      raw = source.bytes?.slice() ?? (await this.fetcher(source.url, signal));
      signal.throwIfAborted();
      const actual = await digest(raw);
      signal.throwIfAborted();
      if (actual.toLowerCase() !== source.sourceHash.toLowerCase())
        throw new Error("MIDI source hash mismatch");
      if (raw.byteLength <= RAW_CACHE_BYTES)
        retainBounded(
          this.rawByHash,
          source.sourceHash,
          raw.slice(),
          RAW_CACHE_BYTES,
          (bytes) => bytes.byteLength,
        );
    } else {
      this.rawByHash.delete(source.sourceHash);
      this.rawByHash.set(source.sourceHash, raw);
    }
    signal.throwIfAborted();
    const midi = normalizeMidi(this.parser.parse(raw));
    retainBounded(
      this.parsedByHash,
      source.sourceHash,
      midi,
      PARSED_CACHE_BYTES,
      (parsed) => 128 + parsed.events.length * 96,
    );
    return midi;
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
