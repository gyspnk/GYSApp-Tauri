import { describe, expect, it } from "vitest";
import {
  defaultSpeechSettings,
  persistSpeechSettings,
  readSpeechSettings,
} from "./speech-settings.js";

function storage(seed: Record<string, string> = {}) {
  const values = new Map(Object.entries(seed));
  return {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    values,
  };
}

describe("speech settings persistence", () => {
  it("uses safe defaults and rejects invalid persisted values", () => {
    const store = storage({
      "gys-speech-rate-v1": "3",
      "gys-speech-pitch-v1": "nope",
      "gys-speech-volume-v1": "-1",
      "gys-speech-engine-v1": "remote",
      "gys-speech-voice-v1": "voice with spaces",
    });
    expect(readSpeechSettings(store)).toEqual(defaultSpeechSettings);
  });

  it("round-trips rate, pitch, volume, engine, and voice", () => {
    const store = storage();
    persistSpeechSettings(store, {
      voiceId: "id-ID-GadisNeural",
      rate: 1.2,
      pitch: 0.8,
      volume: 0.65,
      engine: "edge",
    });
    expect(readSpeechSettings(store)).toEqual({
      voiceId: "id-ID-GadisNeural",
      rate: 1.2,
      pitch: 0.8,
      volume: 0.65,
      engine: "edge",
    });
  });
});
