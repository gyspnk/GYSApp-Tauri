import type { Locale } from "./i18n.js";

export type ShellTheme = "light" | "dark" | "system" | "amoled" | "sepia";

export type ShellSettings = {
  version: 1;
  locale: Locale;
  theme: ShellTheme;
};

/** The small storage surface used here keeps the boundary easy to test. */
export type ShellStorage = Pick<Storage, "getItem" | "setItem">;

export const SHELL_SETTINGS_KEY = "gys-shell-settings-v1";
export const DEFAULT_SHELL_SETTINGS: ShellSettings = {
  version: 1,
  locale: "id",
  theme: "light",
};

const LOCALES: ReadonlySet<string> = new Set(["id", "en", "zh"]);
const THEMES: ReadonlySet<string> = new Set([
  "light",
  "dark",
  "system",
  "amoled",
  "sepia",
]);

function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && LOCALES.has(value);
}

function isTheme(value: unknown): value is ShellTheme {
  return typeof value === "string" && THEMES.has(value);
}

function parseSettings(value: unknown): ShellSettings | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const candidate = value as Record<string, unknown>;
  return candidate.version === 1 &&
    isLocale(candidate.locale) &&
    isTheme(candidate.theme)
    ? {
        version: 1,
        locale: candidate.locale,
        theme: candidate.theme,
      }
    : undefined;
}

function read(storage: ShellStorage | undefined, key: string): string | null {
  try {
    return storage?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function write(storage: ShellStorage | undefined, key: string, value: string) {
  try {
    storage?.setItem(key, value);
  } catch {
    // Private browsing and embedded webviews can reject writes. Settings are
    // a preference, so an unavailable store must not break application boot.
  }
}

function legacySettings(storage: ShellStorage | undefined): {
  settings: ShellSettings;
  found: boolean;
} {
  const locale = read(storage, "gys-locale");
  const theme = read(storage, "gys-theme");
  return {
    found: locale !== null || theme !== null,
    settings: {
      version: 1,
      locale: isLocale(locale) ? locale : DEFAULT_SHELL_SETTINGS.locale,
      theme: isTheme(theme) ? theme : DEFAULT_SHELL_SETTINGS.theme,
    },
  };
}

function persist(storage: ShellStorage | undefined, settings: ShellSettings) {
  const serialized = JSON.stringify(settings);
  write(storage, SHELL_SETTINGS_KEY, serialized);
  // Keep the old keys while older backups and already-installed clients may
  // still contain them. The versioned envelope remains the read source.
  write(storage, "gys-locale", settings.locale);
  write(storage, "gys-theme", settings.theme);
}

export function readShellSettings(storage?: ShellStorage): ShellSettings {
  const raw = read(storage, SHELL_SETTINGS_KEY);
  if (raw !== null) {
    try {
      const parsed = parseSettings(JSON.parse(raw));
      if (parsed) return parsed;
    } catch {
      // Repair malformed settings from legacy values or the safe defaults.
    }
  }

  const legacy = legacySettings(storage);
  const settings = legacy.found ? legacy.settings : DEFAULT_SHELL_SETTINGS;
  persist(storage, settings);
  return settings;
}

export function writeShellSettings(
  value: ShellSettings,
  storage?: ShellStorage,
): void {
  const settings = parseSettings(value) ?? DEFAULT_SHELL_SETTINGS;
  persist(storage, settings);
}
