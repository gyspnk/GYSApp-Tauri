import {
  DEFAULT_HIGHLIGHT_COLORS,
  isCustomHighlightColor,
} from "./bible-highlights.js";

export type SavedBibleNote = { id: string; text: string };
export type BibleNotes = Record<string, SavedBibleNote[]>;

export const BOOK_KEY = "gys-bible-book";
export const CHAPTER_KEY = "gys-bible-chapter";
export const BOOKMARKS_KEY = "gys-bible-bookmarks";
export const NOTES_KEY = "gys-bible-notes-v1";
export const HIGHLIGHTS_KEY = "gys-bible-highlights-v1";
export const HIGHLIGHT_PALETTE_KEY = "gys-bible-highlight-palette-v1";
export const SEARCH_HISTORY_KEY = "gys-bible-search-history-v1";
export const VERSION_KEY = "gys-bible-version-v1";
export const MAX_CUSTOM_HIGHLIGHT_COLORS = 6;

export function readSavedNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const saved = Number(localStorage.getItem(key));
  return Number.isInteger(saved) && saved > 0 ? saved : fallback;
}

export function readSavedVersion(): string {
  if (typeof window === "undefined") return "b_tb";
  return localStorage.getItem(VERSION_KEY) ?? "b_tb";
}

export function readStringSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return new Set(
      Array.isArray(value)
        ? value.filter((entry): entry is string => typeof entry === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

export function readStringMap(key: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    );
  } catch {
    return {};
  }
}

export function readBibleNotes(): BibleNotes {
  if (typeof window === "undefined") return {};
  try {
    const value: unknown = JSON.parse(localStorage.getItem(NOTES_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).flatMap(([verseId, stored]) => {
        if (typeof stored === "string") {
          const text = stored.trim();
          return text ? [[verseId, [{ id: `legacy-${verseId}`, text }]]] : [];
        }
        if (!Array.isArray(stored)) return [];
        const notes = stored.flatMap((entry, index) => {
          if (!entry || typeof entry !== "object") return [];
          const note = entry as { id?: unknown; text?: unknown };
          if (typeof note.text !== "string" || !note.text.trim()) return [];
          return [
            {
              id:
                typeof note.id === "string" && note.id
                  ? note.id
                  : `legacy-${verseId}-${index}`,
              text: note.text.trim(),
            },
          ];
        });
        return notes.length ? [[verseId, notes]] : [];
      }),
    );
  } catch {
    return {};
  }
}

export function readBibleHighlights(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(readStringMap(HIGHLIGHTS_KEY)).filter(
      ([, color]) =>
        DEFAULT_HIGHLIGHT_COLORS.includes(
          color as (typeof DEFAULT_HIGHLIGHT_COLORS)[number],
        ) || isCustomHighlightColor(color),
    ),
  );
}

export function readCustomHighlightColors(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(HIGHLIGHT_PALETTE_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (entry): entry is string =>
                typeof entry === "string" && isCustomHighlightColor(entry),
            ),
          ),
        ].slice(0, MAX_CUSTOM_HIGHLIGHT_COLORS)
      : [];
  } catch {
    return [];
  }
}

export function makeBibleNoteId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function readSearchHistory(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(SEARCH_HISTORY_KEY) ?? "[]",
    );
    return Array.isArray(value)
      ? value
          .filter((entry): entry is string => typeof entry === "string")
          .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}
