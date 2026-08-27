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

/** Distribued bible codes share the `b_<tag>` shape; infer from the tag. */
const CODE_TAG_HINTS: Array<[RegExp, string]> = [
  [/^b_tb/i, "id-ID"],
  [/^b_kjv|eng|english/i, "en-US"],
  [/^b_cuv|chn|chinese|mandarin/i, "zh-CN"],
];

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
