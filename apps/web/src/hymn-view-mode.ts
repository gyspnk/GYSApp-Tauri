export type HymnViewerMode = "lyrics" | "chord" | "pdf";

const STORAGE_KEY = "gys-hymn-view-mode-v1";
const DEFAULT_MODE: HymnViewerMode = "lyrics";

type ModeStore = {
  version: 1;
  modes: Record<string, HymnViewerMode>;
};

export function isHymnViewerMode(value: unknown): value is HymnViewerMode {
  return value === "lyrics" || value === "chord" || value === "pdf";
}

function storage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function readStore(target: Storage): ModeStore {
  try {
    const parsed: unknown = JSON.parse(target.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object") return { version: 1, modes: {} };
    const candidate = parsed as { version?: unknown; modes?: unknown };
    if (
      candidate.version !== 1 ||
      !candidate.modes ||
      typeof candidate.modes !== "object"
    )
      return { version: 1, modes: {} };
    const modes = Object.fromEntries(
      Object.entries(candidate.modes).filter(([, mode]) =>
        isHymnViewerMode(mode),
      ),
    ) as Record<string, HymnViewerMode>;
    return { version: 1, modes };
  } catch {
    return { version: 1, modes: {} };
  }
}

export function readHymnViewerMode(songId: string): HymnViewerMode {
  const target = storage();
  if (!target) return DEFAULT_MODE;
  const mode = readStore(target).modes[songId];
  return isHymnViewerMode(mode) ? mode : DEFAULT_MODE;
}

export function writeHymnViewerMode(
  songId: string,
  mode: HymnViewerMode,
): void {
  const target = storage();
  if (!target) return;
  try {
    const next = readStore(target);
    next.modes[songId] = mode;
    // Keep this preference tiny even after a long browsing history.
    const ids = Object.keys(next.modes);
    for (const id of ids.slice(0, Math.max(0, ids.length - 64)))
      delete next.modes[id];
    target.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Private browsing and storage-quota failures should not block reading.
  }
}
