/**
 * Maps an open Bible version to its spoken language so text-to-speech always
 * reads the correct pronunciation (TB → Indonesian, KJV → English, CUV →
 * Chinese). The version code is the publisher's canonical key; a code prefix
 * fallback keeps future distributed versions working without code changes.
 */
const VERSION_LANGUAGE_BY_CODE: Record<string, string> = {
  b_tb: "id-ID",
  b_kjv: "en-US",
  b_cuv: "zh-CN",
};

/** Distributed Bible codes share the `b_<tag>` shape; infer from the tag. */
const CODE_TAG_HINTS: Array<[RegExp, string]> = [
  [/^(?:b_tb)/i, "id-ID"],
  [/^(?:b_kjv|.*eng|.*english)/i, "en-US"],
  [/^(?:b_cuv|.*chn|.*chinese|.*mandarin)/i, "zh-CN"],
];

const INDONESIAN_WORDS = new Set([
  "ada",
  "adalah",
  "akan",
  "allah",
  "aku",
  "bumi",
  "dan",
  "dalam",
  "dari",
  "dengan",
  "engkau",
  "gembala",
  "hidup",
  "ini",
  "itu",
  "kamu",
  "karena",
  "kasih",
  "kepada",
  "kita",
  "langit",
  "menciptakan",
  "mulanya",
  "pada",
  "saya",
  "sebagai",
  "serta",
  "tidak",
  "tuhan",
  "untuk",
  "yang",
]);

const ENGLISH_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "be",
  "beginning",
  "created",
  "earth",
  "for",
  "from",
  "god",
  "heavens",
  "her",
  "his",
  "in",
  "is",
  "lord",
  "my",
  "not",
  "of",
  "our",
  "shepherd",
  "that",
  "the",
  "this",
  "to",
  "us",
  "was",
  "we",
  "with",
  "you",
  "your",
]);

export function bibleSpeechLanguage(versionCode?: string): string {
  if (!versionCode) return "id-ID";
  const exact = VERSION_LANGUAGE_BY_CODE[versionCode.toLowerCase()];
  if (exact) return exact;
  for (const [pattern, tag] of CODE_TAG_HINTS) {
    if (pattern.test(versionCode)) return tag;
  }
  return "id-ID";
}

function languageBase(tag: string): string {
  return tag.split(/[-_]/)[0]?.toLowerCase() ?? "";
}

function normalizeSupportedLanguage(tag?: string): string {
  switch (languageBase(tag ?? "")) {
    case "en":
      return "en-US";
    case "zh":
      return "zh-CN";
    case "id":
    default:
      return "id-ID";
  }
}

/**
 * Lightweight deterministic detection for the languages currently shipped by
 * the app. Han script is decisive; Latin text is scored with common Bible and
 * function words. Ambiguous/short text intentionally keeps the caller's
 * language context instead of guessing unpredictably.
 */
export function detectSpeechLanguage(
  text: string,
  fallbackLanguage = "id-ID",
): string {
  const fallback = normalizeSupportedLanguage(fallbackLanguage);
  const normalized = text.normalize("NFKC").trim();
  if (!normalized) return fallback;

  const hanCharacters = normalized.match(/[\u3400-\u4dbf\u4e00-\u9fff]/gu);
  if ((hanCharacters?.length ?? 0) >= 2) return "zh-CN";

  const words = normalized.toLowerCase().match(/[a-zÀ-ÿ]+/gu) ?? [];
  let indonesianScore = 0;
  let englishScore = 0;
  for (const word of words) {
    if (INDONESIAN_WORDS.has(word)) indonesianScore += 1;
    if (ENGLISH_WORDS.has(word)) englishScore += 1;
  }

  if (indonesianScore >= 2 && indonesianScore > englishScore)
    return "id-ID";
  if (englishScore >= 2 && englishScore > indonesianScore) return "en-US";
  return fallback;
}

/**
 * Picks the best available voice for a language: the user's own voice wins
 * when it already speaks that language; otherwise the first advertised voice
 * matching the language (exact region first, then base language) is used.
 */
export function resolveVoiceForLanguage(
  voices: readonly { id: string; language?: string }[],
  preferredVoiceId: string | undefined,
  languageTag: string,
): string | undefined {
  const candidates = [...voices];
  if (preferredVoiceId) {
    const preferred = candidates.find((voice) => voice.id === preferredVoiceId);
    if (
      preferred &&
      (!preferred.language ||
        languageBase(preferred.language) === languageBase(languageTag))
    )
      return preferred.id;
  }
  const wanted = languageBase(languageTag);
  const matches = candidates.filter(
    (voice) => voice.language && languageBase(voice.language) === wanted,
  );
  const exact = matches.find(
    (voice) =>
      voice.language?.toLowerCase().replace("_", "-") ===
      languageTag.toLowerCase(),
  );
  return (exact ?? matches[0])?.id;
}

/** Resolve language and voice independently for every queued speech item. */
export function resolveSpeechVoiceForText(
  voices: readonly { id: string; language?: string }[],
  preferredVoiceId: string | undefined,
  text: string,
  explicitLanguageTag?: string,
): { languageTag: string; voiceId?: string } {
  const preferred = preferredVoiceId
    ? voices.find((voice) => voice.id === preferredVoiceId)
    : undefined;
  const preferredLanguage = preferred?.language;
  const languageTag = explicitLanguageTag
    ? normalizeSupportedLanguage(explicitLanguageTag)
    : detectSpeechLanguage(text, preferredLanguage ?? "id-ID");
  const voiceId = resolveVoiceForLanguage(
    voices,
    preferredVoiceId,
    languageTag,
  );
  return {
    languageTag,
    ...(voiceId ? { voiceId } : {}),
  };
}
