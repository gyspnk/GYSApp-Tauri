/**
 * Versioned Bible reader typography. One global preference (unlike per-hymn
 * typography) because the TB reader is a single continuous surface.
 */
export type BibleTypography = {
  fontSize: number;
  lineHeight: number;
};

export const DEFAULT_BIBLE_TYPOGRAPHY: BibleTypography = {
  fontSize: 20,
  lineHeight: 1.72,
};

export const BIBLE_FONT_SIZE_MIN = 14;
export const BIBLE_FONT_SIZE_MAX = 26;
export const BIBLE_FONT_SIZE_STEP = 1;
export const BIBLE_LINE_HEIGHT_MIN = 1.4;
export const BIBLE_LINE_HEIGHT_MAX = 2.2;

const STORAGE_KEY = "gys-bible-typography-v1";
// Version 2 moved the default from 18 px to 20 px. A stored value without a
// version is a legacy default, so 18 is migrated once; any other stored size was
// a deliberate choice and is left alone.
const STORAGE_VERSION = 2;
const LEGACY_DEFAULT_FONT_SIZE = 18;
const CHANGE_EVENT = "gys-bible-typography-change";

function storage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clampTypography(value: Partial<BibleTypography>): BibleTypography {
  return {
    fontSize: finite(value.fontSize)
      ? Math.round(
          Math.max(
            BIBLE_FONT_SIZE_MIN,
            Math.min(BIBLE_FONT_SIZE_MAX, value.fontSize),
          ),
        )
      : DEFAULT_BIBLE_TYPOGRAPHY.fontSize,
    lineHeight: finite(value.lineHeight)
      ? Math.round(
          Math.max(
            BIBLE_LINE_HEIGHT_MIN,
            Math.min(BIBLE_LINE_HEIGHT_MAX, value.lineHeight),
          ) * 100,
        ) / 100
      : DEFAULT_BIBLE_TYPOGRAPHY.lineHeight,
  };
}

export function readBibleTypography(): BibleTypography {
  const target = storage();
  if (!target) return DEFAULT_BIBLE_TYPOGRAPHY;
  try {
    const parsed: unknown = JSON.parse(target.getItem(STORAGE_KEY) ?? "null");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return DEFAULT_BIBLE_TYPOGRAPHY;
    const candidate = parsed as {
      version?: unknown;
      fontSize?: unknown;
      lineHeight?: unknown;
    };
    if (!finite(candidate.fontSize) || !finite(candidate.lineHeight))
      return DEFAULT_BIBLE_TYPOGRAPHY;
    const legacy = candidate.version !== STORAGE_VERSION;
    const migrated =
      legacy && candidate.fontSize === LEGACY_DEFAULT_FONT_SIZE
        ? DEFAULT_BIBLE_TYPOGRAPHY.fontSize
        : candidate.fontSize;
    const nextValue = clampTypography({
      fontSize: migrated,
      lineHeight: candidate.lineHeight,
    });
    if (legacy) {
      try {
        target.setItem(
          STORAGE_KEY,
          JSON.stringify({ ...nextValue, version: STORAGE_VERSION }),
        );
      } catch {
        // A read must still succeed when storage is read-only.
      }
    }
    return nextValue;
  } catch {
    return DEFAULT_BIBLE_TYPOGRAPHY;
  }
}

export function writeBibleTypography(
  value: Partial<BibleTypography>,
): BibleTypography {
  const nextValue = clampTypography(value);
  const target = storage();
  if (target) {
    try {
      target.setItem(
        STORAGE_KEY,
        JSON.stringify({ ...nextValue, version: STORAGE_VERSION }),
      );
    } catch {
      // Private browsing and quota failures must not block reading.
    }
  }
  if (
    typeof window !== "undefined" &&
    typeof window.dispatchEvent === "function"
  ) {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
  return nextValue;
}

export function subscribeBibleTypography(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const handler = () => listener();
  window.addEventListener(CHANGE_EVENT, handler);
  return () => window.removeEventListener(CHANGE_EVENT, handler);
}

export function increaseBibleFontSize(
  current: BibleTypography,
): BibleTypography {
  return clampTypography({
    fontSize: Math.min(
      BIBLE_FONT_SIZE_MAX,
      current.fontSize + BIBLE_FONT_SIZE_STEP,
    ),
    lineHeight: current.lineHeight,
  });
}

export function decreaseBibleFontSize(
  current: BibleTypography,
): BibleTypography {
  return clampTypography({
    fontSize: Math.max(
      BIBLE_FONT_SIZE_MIN,
      current.fontSize - BIBLE_FONT_SIZE_STEP,
    ),
    lineHeight: current.lineHeight,
  });
}
