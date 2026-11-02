import type { SpeechProvider, SpeechVoice } from "@gys/contracts";

/**
 * No-key natural speech preference. Cloud/natural voices (localService=false,
 * e.g. Microsoft/Google online voices exposed by the platform) rank above
 * bundled local voices, so speech starts on a natural engine without any
 * network request from the app. Local voices remain as automatic fallback.
 */
const NATURAL_VOICE_NAME = /natural|neural|online|premium/i;

/** Named neural voices first, then any cloud voice, then bundled local ones. */
function naturalVoiceRank(voice: SpeechVoice): number {
  if (NATURAL_VOICE_NAME.test(voice.name)) return 0;
  return voice.local ? 2 : 1;
}

function rankedVoices(voices: readonly SpeechVoice[]): SpeechVoice[] {
  return voices
    .map((voice, index) => ({ voice, index }))
    .sort(
      (left, right) =>
        naturalVoiceRank(left.voice) - naturalVoiceRank(right.voice) ||
        left.index - right.index,
    )
    .map(({ voice }) => voice);
}

export function naturalFirstVoices(
  voices: readonly SpeechVoice[],
): SpeechVoice[] {
  return rankedVoices(voices);
}

export function selectNaturalPreferredVoice(
  voices: readonly SpeechVoice[],
  language?: string,
): SpeechVoice | undefined {
  const ranked = rankedVoices(voices);
  const preferred = ranked.filter((voice) => naturalVoiceRank(voice) < 2);
  const byLanguage = preferred.find((voice) => voice.language === language);
  return byLanguage ?? preferred[0] ?? ranked[0];
}

export class BrowserSpeechProvider implements SpeechProvider {
  public readonly id = "browser-system";
  private active: SpeechSynthesisUtterance | undefined;
  private activeCancel: ((error: Error) => void) | undefined;

  public constructor(private readonly localOnly = false) {}

  public async status(): Promise<{
    available: boolean;
    offline: boolean;
    reason?: string;
  }> {
    if (typeof window === "undefined" || !("speechSynthesis" in window))
      return {
        available: false,
        offline: false,
        reason: "Speech synthesis is unavailable",
      };
    const voices = await this.voices();
    return {
      available: !this.localOnly || voices.length > 0,
      offline: this.localOnly
        ? voices.length > 0
        : voices.some((voice) => voice.local) || voices.length === 0,
      ...(this.localOnly && voices.length === 0
        ? { reason: "No local speech voice is available" }
        : {}),
    };
  }

  public async voices(): Promise<SpeechVoice[]> {
    if (!("speechSynthesis" in window)) return [];
    const read = (): SpeechVoice[] => {
      const voices = naturalFirstVoices(
        window.speechSynthesis.getVoices().map((voice) => ({
          id: voice.voiceURI,
          name: voice.name,
          language: voice.lang,
          local: voice.localService,
        })),
      );
      return this.localOnly ? voices.filter((voice) => voice.local) : voices;
    };
    const current = read();
    if (current.length > 0) return current;
    return new Promise((resolve) => {
      let settled = false;
      let timer: number | undefined;
      const finish = () => {
        if (settled) return;
        settled = true;
        if (timer !== undefined) window.clearTimeout(timer);
        window.speechSynthesis.removeEventListener("voiceschanged", onVoices);
        resolve(read());
      };
      const onVoices = () => {
        finish();
      };
      window.speechSynthesis.addEventListener("voiceschanged", onVoices, {
        once: true,
      });
      timer = window.setTimeout(finish, 800);
    });
  }

  public async speak(
    text: string,
    options: {
      voiceId?: string;
      languageTag?: string;
      rate?: number;
      pitch?: number;
      volume?: number;
    },
    signal?: AbortSignal,
  ): Promise<void> {
    if (signal?.aborted)
      throw new DOMException("Speech cancelled", "AbortError");
    if (typeof window === "undefined" || !(await this.status()).available)
      throw new Error("No browser voice is available");
    if (signal?.aborted)
      throw new DOMException("Speech cancelled", "AbortError");
    await this.stop();
    if (signal?.aborted)
      throw new DOMException("Speech cancelled", "AbortError");
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = options.rate ?? 1;
    utterance.pitch = options.pitch ?? 1;
    utterance.volume = options.volume ?? 1;
    const voices = await this.voices();
    if (signal?.aborted)
      throw new DOMException("Speech cancelled", "AbortError");
    const language = options.languageTag ?? "id-ID";
    const requestedVoice = options.voiceId
      ? voices.find((candidate) => candidate.id === options.voiceId)
      : undefined;
    const voice =
      requestedVoice ?? selectNaturalPreferredVoice(voices, language);
    utterance.lang = voice?.language ?? language;
    if (voice)
      utterance.voice =
        window.speechSynthesis
          .getVoices()
          .find((candidate) => candidate.voiceURI === voice.id) ?? null;
    this.active = utterance;
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const cleanup = () => {
        signal?.removeEventListener("abort", abort);
        if (this.activeCancel === cancel) this.activeCancel = undefined;
        if (this.active === utterance) this.active = undefined;
      };
      const cancel = (error: Error) => {
        if (settled) return;
        settled = true;
        window.speechSynthesis.cancel();
        cleanup();
        reject(error);
      };
      const abort = () =>
        cancel(new DOMException("Speech cancelled", "AbortError"));
      this.activeCancel = cancel;
      signal?.addEventListener("abort", abort, { once: true });
      utterance.onend = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      utterance.onerror = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error("Browser speech failed"));
      };
      window.speechSynthesis.speak(utterance);
    });
  }

  public async pause(): Promise<void> {
    window.speechSynthesis.pause();
  }
  public async resume(): Promise<void> {
    window.speechSynthesis.resume();
  }
  public async stop(): Promise<void> {
    this.activeCancel?.(new DOMException("Speech cancelled", "AbortError"));
    window.speechSynthesis.cancel();
    this.active = undefined;
    this.activeCancel = undefined;
  }
}
