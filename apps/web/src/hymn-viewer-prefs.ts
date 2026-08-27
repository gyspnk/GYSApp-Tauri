/**
 * Global viewer preferences (gyschordweb `prefs` object parity):
 * - preload: enabled/count/shuffle/cacheMax
 * - PDF default presentation: two-page / vertical scroll
 * Persisted as one JSON record with safe defaults. The MIDI crossfade
 * duration lives on the queue options (exportable), see midi-playlist.ts.
 */
export type HymnViewerPrefs = {
  preloadEnabled: boolean;
  preloadCount: number;
  preloadShuffle: boolean;
  preloadCacheMax: number;
  defaultTwoPage: boolean;
  defaultVerticalScroll: boolean;
};

const STORAGE_KEY = "gys-hymn-viewer-prefs-v1";

export const DEFAULT_HYMN_VIEWER_PREFS: HymnViewerPrefs = {
  preloadEnabled: true,
  preloadCount: 1,
  preloadShuffle: true,
  preloadCacheMax: 12,
  defaultTwoPage: false,
  defaultVerticalScroll: false,
};

export function readHymnViewerPrefs(): HymnViewerPrefs {
  if (typeof window === "undefined") return { ...DEFAULT_HYMN_VIEWER_PREFS };
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "null",
    );
    if (!parsed || typeof parsed !== "object")
      return { ...DEFAULT_HYMN_VIEWER_PREFS };
    const source = parsed as Partial<HymnViewerPrefs>;
    return {
      preloadEnabled:
        typeof source.preloadEnabled === "boolean"
          ? source.preloadEnabled
          : DEFAULT_HYMN_VIEWER_PREFS.preloadEnabled,
      preloadCount:
        typeof source.preloadCount === "number"
          ? Math.max(1, Math.min(5, Math.trunc(source.preloadCount)))
          : DEFAULT_HYMN_VIEWER_PREFS.preloadCount,
      preloadShuffle:
        typeof source.preloadShuffle === "boolean"
          ? source.preloadShuffle
          : DEFAULT_HYMN_VIEWER_PREFS.preloadShuffle,
      preloadCacheMax:
        typeof source.preloadCacheMax === "number"
          ? Math.max(4, Math.min(24, Math.trunc(source.preloadCacheMax)))
          : DEFAULT_HYMN_VIEWER_PREFS.preloadCacheMax,
      defaultTwoPage: source.defaultTwoPage === true,
      defaultVerticalScroll: source.defaultVerticalScroll === true,
    };
  } catch {
    return { ...DEFAULT_HYMN_VIEWER_PREFS };
  }
}

export function writeHymnViewerPrefs(patch: Partial<HymnViewerPrefs>): void {
  const next = { ...readHymnViewerPrefs(), ...patch };
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage failure must not break the reader.
    }
  }
}

/** gyschordweb defaultTwoPage/defaultVerticalScroll are mutually exclusive. */
export function setDefaultPdfLayout(
  mode: "single" | "double" | "vertical",
): void {
  writeHymnViewerPrefs({
    ...(mode === "double"
      ? { defaultTwoPage: true, defaultVerticalScroll: false }
      : {}),
    ...(mode === "vertical"
      ? { defaultVerticalScroll: true, defaultTwoPage: false }
      : {}),
    ...(mode === "single"
      ? { defaultTwoPage: false, defaultVerticalScroll: false }
      : {}),
  });
}
