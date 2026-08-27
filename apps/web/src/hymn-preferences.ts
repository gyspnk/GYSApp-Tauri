/** Small, versioned reader preferences kept separate from hymn content. */
export type HymnTypography = {
  fontSize: number;
  lineHeight: number;
};

/**
 * gyschordweb `prefs.preferNaturalChords`: a default upward transpose (-1)
 * is applied for songs whose PDF key lands on a black key.
 */
const NATURAL_CHORD_KEY = "gys-hymn-natural-chords";

export function readNaturalChordPreference(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const value = window.localStorage.getItem(NATURAL_CHORD_KEY);
    return value === null ? true : value !== "0";
  } catch {
    return true;
  }
}

export function writeNaturalChordPreference(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NATURAL_CHORD_KEY, enabled ? "1" : "0");
  } catch {
    // Storage failures must not break the reader.
  }
}

export const DEFAULT_HYMN_TYPOGRAPHY: HymnTypography = {
  fontSize: 18,
  lineHeight: 1.65,
};

const STORAGE_KEY = "gys-hymn-typography-v1";
const MAX_SONGS = 64;

type Store = {
  version: 1;
  songs: Record<string, HymnTypography>;
};

function storage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampTypography(value: Partial<HymnTypography>): HymnTypography {
  return {
    fontSize: finite(value.fontSize)
      ? Math.round(Math.max(16, Math.min(28, value.fontSize)) * 10) / 10
      : DEFAULT_HYMN_TYPOGRAPHY.fontSize,
    lineHeight: finite(value.lineHeight)
      ? Math.round(Math.max(1.4, Math.min(2.2, value.lineHeight)) * 100) / 100
      : DEFAULT_HYMN_TYPOGRAPHY.lineHeight,
  };
}

function readStore(target: Storage): Store {
  try {
    const parsed: unknown = JSON.parse(target.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { version: 1, songs: {} };
    const candidate = parsed as { version?: unknown; songs?: unknown };
    if (candidate.version !== 1 || !candidate.songs) {
      return { version: 1, songs: {} };
    }
    const songs = Object.fromEntries(
      Object.entries(candidate.songs as Record<string, unknown>).flatMap(
        ([id, value]) => {
          if (!value || typeof value !== "object" || Array.isArray(value))
            return [];
          const next = clampTypography(value as Partial<HymnTypography>);
          const raw = value as { fontSize?: unknown; lineHeight?: unknown };
          if (!finite(raw.fontSize) || !finite(raw.lineHeight)) return [];
          return [[id, next]] as const;
        },
      ),
    );
    return { version: 1, songs };
  } catch {
    return { version: 1, songs: {} };
  }
}

export function readHymnTypography(songId: string): HymnTypography {
  const target = storage();
  if (!target) return DEFAULT_HYMN_TYPOGRAPHY;
  return readStore(target).songs[songId] ?? DEFAULT_HYMN_TYPOGRAPHY;
}

export function writeHymnTypography(
  songId: string,
  value: Partial<HymnTypography>,
): HymnTypography {
  const nextValue = clampTypography(value);
  const target = storage();
  if (!target) return nextValue;
  try {
    const next = readStore(target);
    next.songs[songId] = nextValue;
    const ids = Object.keys(next.songs);
    for (const id of ids.slice(0, Math.max(0, ids.length - MAX_SONGS)))
      delete next.songs[id];
    target.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing and quota failures must not block reading.
  }
  return nextValue;
}
