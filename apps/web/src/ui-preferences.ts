export type UiDensity = "comfortable" | "standard" | "compact";
export type UiFont = "auto" | "hymnal" | "sans";

export type UiPreferences = {
  version: 1;
  density: UiDensity;
  font: UiFont;
};

export type UiPreferenceStorage = Pick<Storage, "getItem" | "setItem">;
export type UiPreferenceRoot = {
  dataset: {
    uiDensity?: string;
    uiFont?: string;
  };
};

export const UI_PREFERENCES_STORAGE_KEY = "gys-ui-preferences-v1";

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  version: 1,
  density: "standard",
  font: "auto",
};

const DENSITIES = new Set<UiDensity>(["comfortable", "standard", "compact"]);
const FONTS = new Set<UiFont>(["auto", "hymnal", "sans"]);
const listeners = new Set<() => void>();
const memoryStorage = createMemoryUiPreferenceStorage();
let currentPreferences: UiPreferences = { ...DEFAULT_UI_PREFERENCES };

function browserStorage(): UiPreferenceStorage {
  if (typeof window !== "undefined") {
    try {
      if (window.localStorage) return window.localStorage;
    } catch {
      // Private/restricted storage falls back to process memory.
    }
  }
  return memoryStorage;
}

function browserRoot(): UiPreferenceRoot | undefined {
  if (typeof document === "undefined") return undefined;
  return document.documentElement;
}

function normalizeUiPreferences(value: unknown): UiPreferences {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_UI_PREFERENCES };
  }
  const candidate = value as Partial<UiPreferences>;
  return {
    version: 1,
    density: DENSITIES.has(candidate.density as UiDensity)
      ? (candidate.density as UiDensity)
      : DEFAULT_UI_PREFERENCES.density,
    font: FONTS.has(candidate.font as UiFont)
      ? (candidate.font as UiFont)
      : DEFAULT_UI_PREFERENCES.font,
  };
}

export function createMemoryUiPreferenceStorage(
  seed: Record<string, string> = {},
): UiPreferenceStorage {
  const entries = new Map(Object.entries(seed));
  return {
    getItem(key) {
      return entries.get(key) ?? null;
    },
    setItem(key, value) {
      entries.set(key, value);
    },
  };
}

export function readUiPreferences(
  storage: UiPreferenceStorage = browserStorage(),
): UiPreferences {
  try {
    const raw = storage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_UI_PREFERENCES };
    return normalizeUiPreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_UI_PREFERENCES };
  }
}

export function writeUiPreferences(
  patch: Partial<Pick<UiPreferences, "density" | "font">>,
  storage: UiPreferenceStorage = browserStorage(),
): UiPreferences {
  const next = normalizeUiPreferences({
    ...readUiPreferences(storage),
    ...patch,
  });
  try {
    storage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // A storage failure must never make the application unusable.
  }
  return next;
}

export function applyUiPreferences(
  preferences: UiPreferences,
  root: UiPreferenceRoot | undefined = browserRoot(),
): void {
  if (!root) return;
  root.dataset.uiDensity = preferences.density;
  root.dataset.uiFont = preferences.font;
}

export function getUiPreferences(): UiPreferences {
  return currentPreferences;
}

export function initializeUiPreferences(
  options: {
    storage?: UiPreferenceStorage;
    root?: UiPreferenceRoot;
  } = {},
): UiPreferences {
  const next = readUiPreferences(options.storage ?? browserStorage());
  currentPreferences = next;
  applyUiPreferences(next, options.root ?? browserRoot());
  return next;
}

export function setUiPreferences(
  patch: Partial<Pick<UiPreferences, "density" | "font">>,
  options: {
    storage?: UiPreferenceStorage;
    root?: UiPreferenceRoot;
  } = {},
): UiPreferences {
  const next = writeUiPreferences(patch, options.storage ?? browserStorage());
  currentPreferences = next;
  applyUiPreferences(next, options.root ?? browserRoot());
  for (const listener of listeners) listener();
  return next;
}

export function subscribeUiPreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
