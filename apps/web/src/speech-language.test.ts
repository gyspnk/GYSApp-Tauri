import { describe, expect, it } from "vitest";
import * as bibleLanguage from "./bible-language.js";

const moduleUnderTest = bibleLanguage as typeof bibleLanguage & {
  detectSpeechLanguage?: (text: string, fallback?: string) => string;
  resolveSpeechVoiceForText?: (
    voices: readonly { id: string; name: string; language: string; local: boolean }[],
    preferredVoiceId: string | undefined,
    text: string,
    explicitLanguageTag?: string,
  ) => { languageTag: string; voiceId?: string };
};

const voices = [
  { id: "id-ID-GadisNeural", name: "Gadis", language: "id-ID", local: false },
  { id: "en-US-JennyNeural", name: "Jenny", language: "en-US", local: false },
  { id: "zh-CN-XiaoxiaoNeural", name: "Xiaoxiao", language: "zh-CN", local: false },
];

describe("automatic speech language selection", () => {
  it("detects Indonesian, English, and Chinese text without a caller hint", () => {
    expect(moduleUnderTest.detectSpeechLanguage).toBeTypeOf("function");
    const detect = moduleUnderTest.detectSpeechLanguage!;
    expect(detect("Pada mulanya Allah menciptakan langit dan bumi.")).toBe("id-ID");
    expect(detect("In the beginning God created the heavens and the earth.")).toBe("en-US");
    expect(detect("起初，神创造天地。In the beginning")).toBe("zh-CN");
  });

  it("uses an explicit Bible language hint over heuristic detection", () => {
    expect(moduleUnderTest.resolveSpeechVoiceForText).toBeTypeOf("function");
    const resolve = moduleUnderTest.resolveSpeechVoiceForText!;
    expect(resolve(voices, "id-ID-GadisNeural", "God is good", "zh-CN")).toEqual({
      languageTag: "zh-CN",
      voiceId: "zh-CN-XiaoxiaoNeural",
    });
  });

  it("chooses a language-matching voice per text instead of forcing the saved voice", () => {
    expect(moduleUnderTest.resolveSpeechVoiceForText).toBeTypeOf("function");
    const resolve = moduleUnderTest.resolveSpeechVoiceForText!;
    expect(resolve(voices, "id-ID-GadisNeural", "The Lord is my shepherd.")).toEqual({
      languageTag: "en-US",
      voiceId: "en-US-JennyNeural",
    });
    expect(resolve(voices, "en-US-JennyNeural", "Tuhan adalah gembalaku.")).toEqual({
      languageTag: "id-ID",
      voiceId: "id-ID-GadisNeural",
    });
  });

  it("falls back deterministically for short ambiguous text", () => {
    expect(moduleUnderTest.detectSpeechLanguage).toBeTypeOf("function");
    expect(moduleUnderTest.detectSpeechLanguage!("Amin")).toBe("id-ID");
    expect(moduleUnderTest.detectSpeechLanguage!("Amen", "en-US")).toBe("en-US");
  });
});
