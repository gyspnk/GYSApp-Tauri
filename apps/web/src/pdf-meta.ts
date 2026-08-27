/**
 * Tempo and key detection from the first PDF page's extracted text.
 *
 * Mirrors gyschordweb viewer-core `_extractPdfTempoFromText`,
 * `_extractPdfKeyFromText` + `parsePdfKeyToSemitone` + `_isBlackKeySemitone`.
 * Lyrics books commonly print the tempo as `♩= 76` and the key as `do=C` /
 * `la=A` / a meter signature `4/4`, so the same heuristics apply.
 */

export const MIDI_TEMPO_FALLBACK_BPM = 76;
export const MIDI_TEMPO_MIN_BPM = 30;
export const MIDI_TEMPO_MAX_BPM = 220;

const BLACK_KEY_SEMITONES = [1, 3, 6, 8, 10];

export function normalizeDetectedTempoBpm(value: unknown): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return MIDI_TEMPO_FALLBACK_BPM;
  const rounded = Math.round(parsed);
  return Math.max(MIDI_TEMPO_MIN_BPM, Math.min(MIDI_TEMPO_MAX_BPM, rounded));
}

/** `♩=120`, `J:`, `Q:=`, `tempo/bpm:`, and a loose `= 120` fallback. */
export function extractPdfTempoFromText(pdfText: string): number {
  if (!pdfText) return MIDI_TEMPO_FALLBACK_BPM;
  const normalized = String(pdfText).replace(/\s+/g, " ").trim();

  const symbolMatch = normalized.match(
    /(?:^|[\s(])(?:J|j|Q|q|♩|♪|𝅘𝅥|𝅘𝅥𝅮)\s*[:=]\s*(\d{2,3})(?=\D|$)/,
  );
  if (symbolMatch) return normalizeDetectedTempoBpm(symbolMatch[1]);

  const bpmLabelMatch = normalized.match(
    /(?:tempo|tempi|bpm)\s*[:=]?\s*(\d{2,3})\b/i,
  );
  if (bpmLabelMatch) return normalizeDetectedTempoBpm(bpmLabelMatch[1]);

  const looseTempoMatch = normalized.match(/(?:^|[^0-9A-Za-z])=\s*(\d{2,3})\b/);
  if (looseTempoMatch) return normalizeDetectedTempoBpm(looseTempoMatch[1]);

  return MIDI_TEMPO_FALLBACK_BPM;
}

/** `do=G`, `la=Am`, or a meter `3/4` prefix followed by the key letter. */
export function extractPdfKeyFromText(pdfText: string): string | null {
  if (!pdfText) return null;
  const keyMatch = pdfText.match(
    /(?:(?:do|la)\s*={1,2}\s*|[23469]\s*[\/|]\s*[248]\s+)([A-G](?:es|is|s|#|b)?(?:m)?)\b/i,
  );
  const key = keyMatch?.[1];
  return key ? key : null;
}

const KEY_TO_SEMITONE: Record<string, number> = {
  c: 0,
  cis: 1,
  des: 1,
  d: 2,
  dis: 3,
  es: 3,
  eb: 3,
  e: 4,
  f: 5,
  fis: 6,
  ges: 6,
  g: 7,
  gis: 8,
  as: 8,
  ab: 8,
  a: 9,
  ais: 10,
  bes: 10,
  bb: 10,
  b: 11,
  h: 11,
};

const SHARP_BASE = { c: 0, d: 2, f: 5, g: 7, a: 9 } as Record<string, number>;
const FLAT_BASE = {
  c: 0,
  d: 2,
  e: 4,
  g: 7,
  a: 9,
  b: 11,
} as Record<string, number>;

function wrapSemitone(value: number): number {
  return ((value % 12) + 12) % 12;
}

/** German/ASCII key strings (`cis`, `des`, `es`, `H`) → pitch class. */
export function parsePdfKeyToSemitone(
  keyStr: string | null | undefined,
): number | null {
  if (!keyStr) return null;
  const key = keyStr.toLowerCase().replace(/m$/, "");
  if (KEY_TO_SEMITONE[key] !== undefined) return KEY_TO_SEMITONE[key];
  if (key.includes("#")) {
    const base = SHARP_BASE[key.charAt(0)];
    if (base !== undefined) return wrapSemitone(base + 1);
  }
  if (key.includes("b")) {
    const base = FLAT_BASE[key.charAt(0)];
    if (base !== undefined) return wrapSemitone(base - 1);
  }
  return null;
}

export function isBlackKeySemitone(semitone: number): boolean {
  return BLACK_KEY_SEMITONES.includes(semitone);
}

/**
 * gyschordweb natural-chord preference: songs written in a black-key key get a
 * default upward preload transpose of -1 so every chord stays natural.
 */
export function detectPreloadTransposeFromPdfText(pdfText: string): number {
  const key = extractPdfKeyFromText(pdfText);
  if (!key) return 0;
  const semitone = parsePdfKeyToSemitone(key);
  return semitone !== null && isBlackKeySemitone(semitone) ? -1 : 0;
}
