import type { SpeechEnginePreference } from "@gys/contracts";

export const SPEECH_STORAGE_KEYS = {
  voice: "gys-speech-voice-v1",
  rate: "gys-speech-rate-v1",
  pitch: "gys-speech-pitch-v1",
  volume: "gys-speech-volume-v1",
  engine: "gys-speech-engine-v1",
} as const;

export type SpeechStorage = Pick<Storage, "getItem" | "setItem">;

export type PersistedSpeechSettings = {
  voiceId?: string;
  rate: number;
  pitch: number;
  volume: number;
  engine: SpeechEnginePreference;
};

export const defaultSpeechSettings: PersistedSpeechSettings = {
  rate: 0.9,
  pitch: 1,
  volume: 1,
  engine: "auto",
};

function readNumber(
  storage: SpeechStorage,
  key: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const value = Number(storage.getItem(key));
  return Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function readVoiceId(storage: SpeechStorage): string | undefined {
  const value = storage.getItem(SPEECH_STORAGE_KEYS.voice)?.trim();
  return value && /^[A-Za-z0-9:_-]{1,160}$/.test(value) ? value : undefined;
}

function readEngine(storage: SpeechStorage): SpeechEnginePreference {
  const value = storage.getItem(SPEECH_STORAGE_KEYS.engine);
  return value === "edge" || value === "local" ? value : "auto";
}

export function readSpeechSettings(
  storage: SpeechStorage,
): PersistedSpeechSettings {
  const voiceId = readVoiceId(storage);
  return {
    ...defaultSpeechSettings,
    ...(voiceId ? { voiceId } : {}),
    rate: readNumber(
      storage,
      SPEECH_STORAGE_KEYS.rate,
      0.5,
      2,
      defaultSpeechSettings.rate,
    ),
    pitch: readNumber(
      storage,
      SPEECH_STORAGE_KEYS.pitch,
      0.5,
      2,
      defaultSpeechSettings.pitch,
    ),
    volume: readNumber(
      storage,
      SPEECH_STORAGE_KEYS.volume,
      0,
      1,
      defaultSpeechSettings.volume,
    ),
    engine: readEngine(storage),
  };
}

export function persistSpeechSettings(
  storage: SpeechStorage | undefined,
  next: Partial<PersistedSpeechSettings>,
): void {
  if (!storage) return;
  try {
    if (next.voiceId !== undefined)
      storage.setItem(SPEECH_STORAGE_KEYS.voice, next.voiceId);
    if (next.rate !== undefined)
      storage.setItem(SPEECH_STORAGE_KEYS.rate, String(next.rate));
    if (next.pitch !== undefined)
      storage.setItem(SPEECH_STORAGE_KEYS.pitch, String(next.pitch));
    if (next.volume !== undefined)
      storage.setItem(SPEECH_STORAGE_KEYS.volume, String(next.volume));
    if (next.engine !== undefined)
      storage.setItem(SPEECH_STORAGE_KEYS.engine, next.engine);
  } catch {
    // Private browsing and embedded webviews may expose a non-writable store.
  }
}
