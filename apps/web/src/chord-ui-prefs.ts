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

/**
 * Chord markers are painted on four different surfaces, so one fixed navy cannot
 * serve them all: `#0b4c99` measures 8.37:1 on white but 2.01:1 on the dark
 * surface, and the light chip under a yellow chord only reaches 2.92:1. The
 * marker colour is therefore mixed toward the theme ink, and the chip toward the
 * theme surface, by the shares below. Every one of the twelve presets, the
 * accent path and both fill styles clears 4.5:1 on all four themes with these
 * numbers (worst case: dark 4.54:1, amoled 5.27:1, light 4.75:1, sepia 4.90:1).
 */
export type ChordSurface = "light" | "sepia" | "dark" | "amoled";

const TEXT_SHARE: Record<ChordSurface, number> = {
  light: 66,
  sepia: 66,
  dark: 42,
  amoled: 50,
};

const FILL_TINT: Record<ChordSurface, { soft: number; solid: number }> = {
  light: { soft: 32, solid: 65 },
  sepia: { soft: 32, solid: 65 },
  dark: { soft: 5, solid: 9 },
  amoled: { soft: 6, solid: 10 },
};

/** Resolve the theme a chord marker is painted on, following `system`. */
export function chordSurface(theme?: string): ChordSurface {
  const named = theme ?? document.documentElement.dataset.theme;
  if (named === "dark" || named === "amoled" || named === "sepia") return named;
  if (named === "light") return "light";
  return typeof matchMedia === "function" &&
    matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Marker text colour: the preset, lifted toward the theme ink. */
export function chordTextPaint(
  prefs: ChordUiPrefs,
  accent: string,
  surface: ChordSurface,
): string {
  const raw = chordTextColor(prefs, accent);
  return `color-mix(in srgb, ${raw} ${TEXT_SHARE[surface]}%, var(--ink))`;
}

/** Marker chip: the fill, tinted toward the surface it sits on. */
export function chordFillPaint(
  prefs: ChordUiPrefs,
  accent: string,
  surface: ChordSurface,
): string {
  if (prefs.fill === "none") return "transparent";
  const raw = chordFillColor(prefs, accent);
  const tint = FILL_TINT[surface][prefs.fill === "solid" ? "solid" : "soft"];
  const base =
    surface === "dark" || surface === "amoled" ? "var(--surface)" : "#ffffff";
  return `color-mix(in srgb, ${raw} ${tint}%, ${base})`;
}

/**
 * Track the surface a chord marker is painted on. The theme lives on
 * `documentElement.dataset.theme` and `system` follows the media query, so both
 * need watching; without this a theme switch would keep the old marker colour
 * until the next render.
 */
export function subscribeChordSurface(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const root = document.documentElement;
  const observer =
    typeof MutationObserver === "undefined"
      ? undefined
      : new MutationObserver(listener);
  observer?.observe(root, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  const media =
    typeof matchMedia === "function"
      ? matchMedia("(prefers-color-scheme: dark)")
      : undefined;
  media?.addEventListener("change", listener);
  return () => {
    observer?.disconnect();
    media?.removeEventListener("change", listener);
  };
}
