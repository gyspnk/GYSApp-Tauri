/**
 * Pronunciation overlay for the offline/system voice path.
 *
 * Device voices read "Allah" with an Arabic stress pattern ("Auoloh"), which is
 * not how an Indonesian reader says it. The offline engines we fall back to do
 * not accept SSML phonemes, so the only lever left is the text handed to
 * `speak`: a syllable break makes them say "Al-lah" instead.
 *
 * Only the offline path uses this. Screen text and cloud voices keep the
 * original spelling.
 */
const LOCAL_PRONUNCIATIONS: readonly [RegExp, string][] = [
  // Keep the capitalisation the author typed; the break is what changes.
  [/\bAllah\b/g, "Al-lah"],
  [/\bALLAH\b/g, "Al-lah"],
];

export function localVoiceText(text: string): string {
  return LOCAL_PRONUNCIATIONS.reduce(
    (readable, [pattern, replacement]) =>
      readable.replace(pattern, replacement),
    text,
  );
}
