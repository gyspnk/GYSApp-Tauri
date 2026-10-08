/** Presentation surfaces. Chords are a capability layered on both. */
export type HymnViewerMode = "lyrics" | "pdf";

const CHORD_STORAGE_KEY = "gys-hymn-chord-visibility-v1";
// One application runtime remembers presentation; a reload/relaunch starts text.
// Explicit ?mode= links remain supported by the router.
let sessionMode: HymnViewerMode = "lyrics";

export function isHymnViewerMode(value: unknown): value is HymnViewerMode {
  return value === "lyrics" || value === "pdf";
}

function storage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

type ChordVisibilityStore = {
  version: 1;
  songs: Record<string, boolean>;
};

function readChordStore(target: Storage): ChordVisibilityStore {
  try {
    const parsed: unknown = JSON.parse(
      target.getItem(CHORD_STORAGE_KEY) ?? "null",
    );
    if (!parsed || typeof parsed !== "object") return { version: 1, songs: {} };
    const candidate = parsed as { version?: unknown; songs?: unknown };
    if (
      candidate.version !== 1 ||
      !candidate.songs ||
      typeof candidate.songs !== "object"
    )
      return { version: 1, songs: {} };
    const songs = Object.fromEntries(
      Object.entries(candidate.songs).filter(
        ([, visible]) => typeof visible === "boolean",
      ),
    ) as Record<string, boolean>;
    return { version: 1, songs };
  } catch {
    return { version: 1, songs: {} };
  }
}

export function readHymnViewerMode(): HymnViewerMode {
  return sessionMode;
}

export function writeHymnViewerMode(mode: HymnViewerMode): void {
  sessionMode = mode;
}

export function resetHymnViewerMode(): void {
  sessionMode = "lyrics";
}

export function readHymnChordVisibility(songId: string): boolean {
  const target = storage();
  if (!target) return false;
  return readChordStore(target).songs[songId] === true;
}

export function writeHymnChordVisibility(
  songId: string,
  visible: boolean,
): void {
  const target = storage();
  if (!target) return;
  try {
    const next = readChordStore(target);
    next.songs[songId] = visible;
    const ids = Object.keys(next.songs);
    for (const id of ids.slice(0, Math.max(0, ids.length - 64)))
      delete next.songs[id];
    target.setItem(CHORD_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing and quota failures should not block the reader.
  }
}
