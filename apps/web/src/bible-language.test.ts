import { describe, expect, it } from "vitest";
import {
  bibleSpeechLanguage,
  resolveVoiceForLanguage,
} from "./bible-language.js";

describe("Bible speech language detection", () => {
  it("maps the bundled version codes to their BCP-47 language", () => {
    expect(bibleSpeechLanguage("b_tb")).toBe("id-ID");
    expect(bibleSpeechLanguage("b_kjv")).toBe("en-US");
    expect(bibleSpeechLanguage("b_cuv")).toBe("zh-CN");
  });

  it("is case-insensitive and falls back safely", () => {
    expect(bibleSpeechLanguage("B_TB")).toBe("id-ID");
    expect(bibleSpeechLanguage(undefined)).toBe("id-ID");
    expect(bibleSpeechLanguage("unknown")).toBe("id-ID");
  });

  it("infers languages for future distributed codes by tag hints", () => {
    expect(bibleSpeechLanguage("b_eng_test")).toBe("en-US");
  });
});

describe("voice resolution per language", () => {
  const voices = [
    { id: "id-ID-GadisNeural", language: "id-ID" },
    { id: "en-US-JennyNeural", language: "en-US" },
    { id: "zh-CN-XiaoxiaoNeural", language: "zh-CN" },
  ];

  it("keeps the saved voice when it already speaks the language", () => {
    expect(resolveVoiceForLanguage(voices, "id-ID-GadisNeural", "id-ID")).toBe(
      "id-ID-GadisNeural",
    );
  });

  it("switches to a matching voice when the saved one speaks another language", () => {
    expect(resolveVoiceForLanguage(voices, "id-ID-GadisNeural", "en-US")).toBe(
      "en-US-JennyNeural",
    );
  });

  it("falls back across region variants of the same base language", () => {
    const regional = [
      { id: "zh-HK-SomeNeural", language: "zh-HK" },
      { id: "zh-CN-XiaoxiaoNeural", language: "zh-CN" },
    ];
    expect(resolveVoiceForLanguage(regional, undefined, "zh-CN")).toBe(
      "zh-CN-XiaoxiaoNeural",
    );
  });

  it("returns undefined without any matching voice", () => {
    expect(
      resolveVoiceForLanguage([voices[0]!], "id-ID-GadisNeural", "fr-FR"),
    ).toBeUndefined();
  });
});
