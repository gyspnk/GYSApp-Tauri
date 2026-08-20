export type AccentPreset = {
  id: string;
  name: string;
  color: string;
};

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  { id: "sapphire", name: "Biru Safir", color: "#2a65c7" },
  { id: "emerald", name: "Zamrud", color: "#059669" },
  { id: "ruby", name: "Merah Delima", color: "#e11d48" },
  { id: "violet", name: "Ungu Amethyst", color: "#7c3aed" },
  { id: "amber", name: "Emas Amber", color: "#d97706" },
  { id: "teal", name: "Teal Samudra", color: "#0d9488" },
  { id: "rose", name: "Mawar Karang", color: "#f43f5e" },
  { id: "sunset", name: "Oranye Senja", color: "#ea580c" },
];

export const DEFAULT_ACCENT_COLOR = ACCENT_PRESETS[0]!.color;
const STORAGE_KEY = "gys-accent-color";

export type AccentStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const memoryStorage = new Map<string, string>();
let activeStorage: AccentStorage = {
  getItem: (key) => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        return window.localStorage.getItem(key);
      } catch {
        return memoryStorage.get(key) ?? null;
      }
    }
    return memoryStorage.get(key) ?? null;
  },
  setItem: (key, val) => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(key, val);
      } catch {
        memoryStorage.set(key, val);
      }
    } else {
      memoryStorage.set(key, val);
    }
  },
  removeItem: (key) => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.removeItem(key);
      } catch {
        memoryStorage.delete(key);
      }
    } else {
      memoryStorage.delete(key);
    }
  },
};

let currentAccent = activeStorage.getItem(STORAGE_KEY) ?? DEFAULT_ACCENT_COLOR;

const listeners = new Set<() => void>();

export function getAccentColor(): string {
  return currentAccent;
}

export function subscribeAccentColor(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function applyAccentToDocument(color: string): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (!color || color === DEFAULT_ACCENT_COLOR) {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--blue");
    root.style.removeProperty("--blue-soft");
    root.style.removeProperty("--navy");
  } else {
    root.style.setProperty("--accent", color);
    root.style.setProperty("--blue", color);
    root.style.setProperty(
      "--blue-soft",
      `color-mix(in srgb, ${color} 15%, var(--surface))`,
    );
    root.style.setProperty(
      "--navy",
      `color-mix(in srgb, ${color} 70%, var(--ink))`,
    );
  }
}

export function setAccentColor(
  color: string,
  customStorage: AccentStorage = activeStorage,
): void {
  const normalized = color.trim().toLowerCase();
  currentAccent = normalized;
  if (normalized === DEFAULT_ACCENT_COLOR) {
    customStorage.removeItem(STORAGE_KEY);
  } else {
    customStorage.setItem(STORAGE_KEY, normalized);
  }
  applyAccentToDocument(normalized);
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // noop
    }
  }
}

export function setAccentStorageForTesting(storage: AccentStorage): void {
  activeStorage = storage;
  currentAccent = storage.getItem(STORAGE_KEY) ?? DEFAULT_ACCENT_COLOR;
}

// Auto-initialize on import in browser
if (typeof window !== "undefined") {
  applyAccentToDocument(currentAccent);
}
