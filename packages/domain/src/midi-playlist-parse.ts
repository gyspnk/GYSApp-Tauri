import type { MidiPlaylist, MidiPlaylistItem } from "@gys/contracts";

/**
 * Hand-written validator for the persisted MIDI playlist.
 *
 * The playlist lives on the first-paint path (App imports the media shell, the
 * shell imports `midiPlaylist`), so pulling zod in here put ~28 KiB gz of schema
 * library in front of the first screen. This validator keeps the same contract as
 * `MidiPlaylistSchema` — defaults for missing options, unknown keys dropped,
 * throws on invalid input — without importing the schema value.
 */

const LOOPS = ["off", "one", "all"] as const;
const AUTO_NEXT_MODES = [
  "off",
  "number",
  "playlist",
  "one",
  "all",
  "shuffle-all",
  "shuffle-playlist",
] as const;
const SHA256 = /^[a-f0-9]{64}$/i;

export class MidiPlaylistError extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "MidiPlaylistError";
  }
}

function fail(path: string, expectation: string): never {
  throw new MidiPlaylistError(`${path}: ${expectation}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(
  source: Record<string, unknown>,
  key: string,
  path: string,
): string {
  const value = source[key];
  if (typeof value !== "string" || value.length === 0) {
    fail(`${path}.${key}`, "expected a non-empty string");
  }
  return value;
}

function integer(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number | undefined,
  path: string,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    fail(path, "expected an integer");
  }
  if (value < minimum) fail(path, `expected at least ${minimum}`);
  if (maximum !== undefined && value > maximum) {
    fail(path, `expected at most ${maximum}`);
  }
  return value;
}

function boolean(value: unknown, fallback: boolean, path: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean") fail(path, "expected a boolean");
  return value;
}

function oneOf<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
  path: string,
): T {
  if (value === undefined) return fallback;
  if (
    typeof value !== "string" ||
    !(allowed as readonly string[]).includes(value)
  ) {
    fail(path, `expected one of ${allowed.join(", ")}`);
  }
  return value as T;
}

function parseItem(value: unknown, path: string): MidiPlaylistItem {
  if (!isRecord(value)) fail(path, "expected an object");
  const item: MidiPlaylistItem = {
    songId: text(value, "songId", path),
    title: text(value, "title", path),
  };
  if (value.sourceHash !== undefined) {
    if (
      typeof value.sourceHash !== "string" ||
      !SHA256.test(value.sourceHash)
    ) {
      fail(`${path}.sourceHash`, "expected a 64-character hexadecimal digest");
    }
    item.sourceHash = value.sourceHash;
  }
  return item;
}

export function parseMidiPlaylist(value: unknown): MidiPlaylist {
  if (!isRecord(value)) fail("playlist", "expected an object");
  if (value.version !== 1) fail("playlist.version", "expected 1");
  if (!Array.isArray(value.items)) fail("playlist.items", "expected an array");
  return {
    version: 1,
    items: value.items.map((item, index) =>
      parseItem(item, `playlist.items[${index}]`),
    ),
    currentIndex: integer(
      value.currentIndex,
      0,
      0,
      undefined,
      "playlist.currentIndex",
    ),
    loop: oneOf(value.loop, LOOPS, "off", "playlist.loop"),
    shuffle: boolean(value.shuffle, false, "playlist.shuffle"),
    autoNext: boolean(value.autoNext, true, "playlist.autoNext"),
    autoNextMode: oneOf(
      value.autoNextMode,
      AUTO_NEXT_MODES,
      "off",
      "playlist.autoNextMode",
    ),
    crossfadeMs: integer(
      value.crossfadeMs,
      0,
      0,
      10_000,
      "playlist.crossfadeMs",
    ),
  };
}
