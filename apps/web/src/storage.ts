/**
 * Versioned local storage boundary for the web shell.
 *
 * Feature modules keep their own payload schemas, while this module owns the
 * one-time migration marker and the legacy keys that existed before the
 * current names were introduced. Migrations are idempotent and never delete
 * a value until its replacement has been written.
 */
export const STORAGE_SCHEMA_VERSION = 2 as const;
const META_KEY = "gys-storage-meta-v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

function readJson(key: string): unknown {
  if (!hasStorage()) return undefined;
  try {
    const value = localStorage.getItem(key);
    return value === null ? undefined : JSON.parse(value);
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown): void {
  if (!hasStorage()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

function validActivity(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as Record<string, unknown>;
  if (state.version !== 1) return false;
  const bible = state.bible;
  if (bible !== undefined) {
    if (!bible || typeof bible !== "object" || Array.isArray(bible))
      return false;
    const entry = bible as Record<string, unknown>;
    if (
      typeof entry.book !== "string" ||
      entry.book.length === 0 ||
      !Number.isInteger(entry.chapter) ||
      Number(entry.chapter) <= 0 ||
      !isIsoDate(entry.updatedAt)
    )
      return false;
  }
  const hymn = state.hymn;
  if (hymn !== undefined) {
    if (!hymn || typeof hymn !== "object" || Array.isArray(hymn)) return false;
    const entry = hymn as Record<string, unknown>;
    if (
      typeof entry.id !== "string" ||
      entry.id.length === 0 ||
      typeof entry.title !== "string" ||
      entry.title.length === 0 ||
      !Number.isInteger(entry.number) ||
      Number(entry.number) <= 0 ||
      !Number.isInteger(entry.verseIndex) ||
      Number(entry.verseIndex) < 0 ||
      !isIsoDate(entry.updatedAt)
    )
      return false;
  }
  return true;
}

function validFavorites(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const state = value as { version?: unknown; items?: unknown };
  if (state.version !== 1 || !Array.isArray(state.items)) return false;
  return state.items.every((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return false;
    const favorite = item as Record<string, unknown>;
    return (
      typeof favorite.id === "string" &&
      favorite.id.length > 0 &&
      (favorite.kind === "hymn" || favorite.kind === "literature") &&
      typeof favorite.title === "string" &&
      favorite.title.length > 0 &&
      isIsoDate(favorite.updatedAt)
    );
  });
}

function validMeta(value: unknown): value is { version: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const meta = value as Record<string, unknown>;
  return (
    typeof meta.version === "number" &&
    Number.isInteger(meta.version) &&
    meta.version > 0 &&
    isIsoDate(meta.migratedAt)
  );
}

function migrateLegacyActivity(): boolean {
  if (!hasStorage() || localStorage.getItem("gys-activity-v1")) return false;
  const parsed = readJson("gys-activity");
  if (!validActivity(parsed)) return false;
  writeJson("gys-activity-v1", parsed);
  return true;
}

function migrateLegacyFavorites(): boolean {
  if (!hasStorage() || localStorage.getItem("gys-favorites-v1")) return false;
  const legacy = readJson("gys-favorites");
  const next = { version: 1, items: Array.isArray(legacy) ? legacy : [] };
  if (!validFavorites(next)) return false;
  writeJson("gys-favorites-v1", next);
  return true;
}

function migrateLegacyLiteratureProgress(): boolean {
  if (
    !hasStorage() ||
    localStorage.getItem("gys-literature-progress-v1") ||
    !localStorage.getItem("gys-literature-progress")
  )
    return false;
  const parsed = readJson("gys-literature-progress");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return false;
  writeJson("gys-literature-progress-v1", parsed);
  return true;
}

/** Run all known migrations once per app start. Safe to call repeatedly. */
export function runStorageMigrations(): { version: number; changed: boolean } {
  if (!hasStorage()) return { version: STORAGE_SCHEMA_VERSION, changed: false };
  const current = readJson(META_KEY);
  if (validMeta(current) && current.version >= STORAGE_SCHEMA_VERSION)
    return { version: current.version, changed: false };

  const changed = [
    migrateLegacyActivity(),
    migrateLegacyFavorites(),
    migrateLegacyLiteratureProgress(),
  ].some(Boolean);
  writeJson(META_KEY, {
    version: STORAGE_SCHEMA_VERSION,
    migratedAt: new Date().toISOString(),
  });
  return { version: STORAGE_SCHEMA_VERSION, changed };
}

export function readVersionedJson<T>(
  key: string,
  parse: (value: unknown) => T | undefined,
): T | undefined {
  return parse(readJson(key));
}

export function writeVersionedJson(key: string, value: unknown): void {
  writeJson(key, value);
}
