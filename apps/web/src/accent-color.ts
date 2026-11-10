export type AccentPreset = {
  id: string;
  name: string;
  color: string;
};

export const ACCENT_PRESETS: readonly AccentPreset[] = [
  // The first preset is the default: GYS blue, the colour the app ships with.
  { id: "church-blue", name: "Biru GYS", color: "#00719c" },
  { id: "forest", name: "Hijau hutan", color: "#0d4326" },
  { id: "ink", name: "Tinta hangat", color: "#874536" },
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

/** Choose the more readable foreground for a user-selected opaque hex accent. */
export function getAccentForeground(color: string): string | undefined {
  const match = /^#([a-f0-9]{6}|[a-f0-9]{3})$/i.exec(color);
  if (!match) return undefined;
  const hex =
    match[1]!.length === 3
      ? [...match[1]!].map((digit) => digit + digit).join("")
      : match[1]!;
  const luminance = [0, 2, 4]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((channel) =>
      channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, channel, index) => sum + channel * [0.2126, 0.7152, 0.0722][index]!,
      0,
    );
  // Black/white guarantee AA at every opaque accent luminance. Off-black
  // leaves a mid-tone gap where neither foreground reaches 4.5:1.
  return (luminance + 0.05) / 0.05 > 1.05 / (luminance + 0.05)
    ? "#000000"
    : "#ffffff";
}

function parseRgb(value: string): [number, number, number] | null {
  const match = /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/.exec(value);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** Resolve any CSS colour (hex, var(), color-mix()) to RGB channels. */
function resolveToRgb(value: string): [number, number, number] | null {
  // Tests and native shells provide a partial document without a DOM.
  if (
    typeof document === "undefined" ||
    typeof document.createElement !== "function" ||
    !document.body
  ) {
    return null;
  }
  const probe = document.createElement("span");
  probe.style.color = value;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();
  return parseRgb(resolved);
}

function toHex([red, green, blue]: [number, number, number]): string {
  return `#${[red, green, blue]
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

/** Recompute the composed accent foreground when the theme changes. */
let themeWatcher: MutationObserver | null = null;

export function applyAccentToDocument(color: string): void {
  if (typeof document === "undefined") return;
  syncNativeAccent(color || DEFAULT_ACCENT_COLOR);
  const root = document.documentElement;
  if (!color || color === DEFAULT_ACCENT_COLOR) {
    root.style.removeProperty("--accent");
    root.style.removeProperty("--on-accent");
    root.style.removeProperty("--accent-fill");
    root.style.removeProperty("--blue");
    root.style.removeProperty("--blue-soft");
    root.style.removeProperty("--navy");
    root.style.removeProperty("--on-accent-strong");
    themeWatcher?.disconnect();
    themeWatcher = null;
  } else {
    root.style.setProperty("--accent", color);
    const foreground = getAccentForeground(color);
    if (foreground) root.style.setProperty("--on-accent", foreground);
    else root.style.removeProperty("--on-accent");
    root.style.setProperty("--accent-fill", color);
    // Filled actions retain the chosen color. Foreground ink blends toward
    // the current theme so even white/yellow/black custom accents stay legible.
    root.style.setProperty(
      "--blue",
      `color-mix(in srgb, ${color} 30%, var(--ink))`,
    );
    root.style.setProperty(
      "--blue-soft",
      `color-mix(in srgb, ${color} 15%, var(--surface))`,
    );
    root.style.setProperty(
      "--navy",
      `color-mix(in srgb, ${color} 20%, var(--ink))`,
    );

    // `--blue` is this accent mixed toward the theme ink, so the foreground
    // chosen for the raw accent no longer fits it (black on the olive mix
    // measured 3.63:1). Pick the foreground from the composed colour.
    const ink = resolveToRgb("var(--ink)");
    const accent = parseRgb(color) ?? resolveToRgb(color);
    if (ink && accent) {
      const mixed = accent.map(
        (channel, index) => channel * 0.3 + ink[index]! * 0.7,
      ) as [number, number, number];
      root.style.setProperty(
        "--on-accent-strong",
        getAccentForeground(toHex(mixed)) ?? "#ffffff",
      );
    }

    if (typeof MutationObserver !== "undefined" && !themeWatcher) {
      themeWatcher = new MutationObserver(() => {
        applyAccentToDocument(currentAccent);
      });
      themeWatcher.observe(root, {
        attributes: true,
        attributeFilter: ["data-theme"],
      });
    }
  }
}

/** The Android listener accepts a color only, from the native main-frame origin. */
function syncNativeAccent(color = currentAccent): void {
  if (typeof window === "undefined") return;
  const match = /^#([a-f0-9]{6}|[a-f0-9]{3})$/i.exec(color);
  if (!match) return;
  const hex =
    match[1]!.length === 3
      ? [...match[1]!].map((digit) => digit + digit).join("")
      : match[1]!;
  const bridge = (
    window as Window & {
      GysStatusAccent?: { postMessage: (color: string) => void };
    }
  ).GysStatusAccent;
  try {
    bridge?.postMessage(`#${hex.toLowerCase()}`);
  } catch {
    /* Shell teardown must not break web appearance. */
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
  window.addEventListener("pageshow", () => syncNativeAccent());
  window.addEventListener("gys-native-accent-request", () =>
    syncNativeAccent(),
  );
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") syncNativeAccent();
  });
}
