/** gyschordweb `chord-ui-prefs` parity: chord marker theming (text + PDF). */

export type ChordThemeKey =
  | "blue"
  | "red"
  | "green"
  | "yellow"
  | "purple"
  | "pink"
  | "teal"
  | "orange"
  | "brown"
  | "gray"
  | "indigo"
  | "cyan";

export type ChordFillKey =
  | "blue"
  | "red"
  | "green"
  | "yellow"
  | "purple"
  | "pink"
  | "teal"
  | "orange"
  | "brown"
  | "gray"
  | "indigo"
  | "cyan";

export type ChordFillStyle = "none" | "soft" | "solid";

export type ChordUiPrefs = {
  theme: ChordThemeKey;
  fill: ChordFillStyle;
  fillColor: ChordFillKey;
  fillOpacityPercent: number;
  fontOverridePercent: number;
  fillPaddingPercent: number;
  syncThemeWithAccent: boolean;
  syncFillWithAccent: boolean;
};

export const CHORD_THEME_PRESETS: ReadonlyArray<{
  key: ChordThemeKey;
  label: string;
  color: string;
}> = [
  { key: "blue", label: "Biru", color: "#0b4c99" },
  { key: "red", label: "Merah", color: "#9c1616" },
  { key: "green", label: "Hijau", color: "#1b5a20" },
  { key: "yellow", label: "Kuning", color: "#b38200" },
  { key: "purple", label: "Ungu", color: "#59117a" },
  { key: "pink", label: "Pink", color: "#960e44" },
  { key: "teal", label: "Teal", color: "#004d43" },
  { key: "orange", label: "Oranye", color: "#b35600" },
  { key: "brown", label: "Coklat", color: "#3e2923" },
  { key: "gray", label: "Abu-abu", color: "#383838" },
  { key: "indigo", label: "Nila", color: "#1e2870" },
  { key: "cyan", label: "Sian", color: "#00646e" },
];

export const CHORD_FILL_PRESETS: ReadonlyArray<{
  key: ChordFillKey;
  label: string;
  color: string;
}> = [
  { key: "blue", label: "Biru", color: "#b8dbff" },
  { key: "red", label: "Merah", color: "#ffc4c4" },
  { key: "green", label: "Hijau", color: "#b8f0bc" },
  { key: "yellow", label: "Kuning", color: "#ffecb3" },
  { key: "purple", label: "Ungu", color: "#e3bdf2" },
  { key: "pink", label: "Pink", color: "#ffbccf" },
  { key: "teal", label: "Teal", color: "#b7efe8" },
  { key: "orange", label: "Oranye", color: "#ffd2a8" },
  { key: "brown", label: "Coklat", color: "#d7c2b4" },
  { key: "gray", label: "Abu-abu", color: "#d0d7de" },
  { key: "indigo", label: "Nila", color: "#c7d2fe" },
  { key: "cyan", label: "Sian", color: "#b2ebf2" },
];

export const DEFAULT_CHORD_UI_PREFS: ChordUiPrefs = {
  theme: "blue",
  fill: "soft",
  fillColor: "blue",
  fillOpacityPercent: 70,
  fontOverridePercent: 100,
  fillPaddingPercent: 100,
  syncThemeWithAccent: false,
  syncFillWithAccent: false,
};

const STORAGE_KEY = "gys-chord-ui-prefs";
const EVENT_NAME = "gys-chord-ui-prefs-change";

const THEME_KEYS = new Set(CHORD_THEME_PRESETS.map((preset) => preset.key));
const FILL_KEYS = new Set(CHORD_FILL_PRESETS.map((preset) => preset.key));

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function readChordUiPrefs(): ChordUiPrefs {
  if (typeof window === "undefined") return DEFAULT_CHORD_UI_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CHORD_UI_PREFS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return DEFAULT_CHORD_UI_PREFS;
    const value = parsed as Partial<ChordUiPrefs>;
    return {
      theme: THEME_KEYS.has(value.theme as ChordThemeKey)
        ? (value.theme as ChordThemeKey)
        : DEFAULT_CHORD_UI_PREFS.theme,
      fill:
        value.fill === "none" || value.fill === "solid" || value.fill === "soft"
          ? value.fill
          : DEFAULT_CHORD_UI_PREFS.fill,
      fillColor: FILL_KEYS.has(value.fillColor as ChordFillKey)
        ? (value.fillColor as ChordFillKey)
        : DEFAULT_CHORD_UI_PREFS.fillColor,
      fillOpacityPercent: finiteNumber(
        value.fillOpacityPercent,
        DEFAULT_CHORD_UI_PREFS.fillOpacityPercent,
      ),
      fontOverridePercent: finiteNumber(
        value.fontOverridePercent,
        DEFAULT_CHORD_UI_PREFS.fontOverridePercent,
      ),
      fillPaddingPercent: finiteNumber(
        value.fillPaddingPercent,
        DEFAULT_CHORD_UI_PREFS.fillPaddingPercent,
      ),
      syncThemeWithAccent: value.syncThemeWithAccent === true,
      syncFillWithAccent: value.syncFillWithAccent === true,
    };
  } catch {
    return DEFAULT_CHORD_UI_PREFS;
  }
}

export function writeChordUiPrefs(next: ChordUiPrefs): ChordUiPrefs {
  if (typeof window === "undefined") return next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent(EVENT_NAME));
  } catch {
    // Storage failures must not break the reader.
  }
  return next;
}

export function subscribeChordUiPrefs(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onChange = () => listener();
  window.addEventListener(EVENT_NAME, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT_NAME, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Resolve the effective chord text color, honoring sync-with-accent. */
export function chordTextColor(prefs: ChordUiPrefs, accent: string): string {
  if (prefs.syncThemeWithAccent) return accent;
  return (
    CHORD_THEME_PRESETS.find((preset) => preset.key === prefs.theme)?.color ??
    "#0b4c99"
  );
}

/** Resolve the effective chord fill background color, honoring sync-with-accent. */
export function chordFillColor(prefs: ChordUiPrefs, accent: string): string {
  if (prefs.syncFillWithAccent) return accent;
  return (
    CHORD_FILL_PRESETS.find((preset) => preset.key === prefs.fillColor)
      ?.color ?? "#b8dbff"
  );
}
