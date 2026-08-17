import { describe, expect, it } from "vitest";
import type { SpeechVoice } from "@gys/contracts";
import { naturalFirstVoices, selectNaturalPreferredVoice } from "./platform.js";

const local = (id: string, language = "id-ID"): SpeechVoice => ({
  id,
  name: id,
  language,
  local: true,
});

const natural = (id: string, language = "id-ID"): SpeechVoice => ({
  id,
  name: id,
  language,
  local: false,
});

describe("no-key natural speech preference", () => {
  it("ranks natural/cloud voices above bundled local voices stably", () => {
    const voices = [
      local("local-a"),
      natural("edge-id"),
      local("local-b"),
      natural("edge-en", "en-US"),
    ];
    expect(naturalFirstVoices(voices).map((v) => v.id)).toEqual([
      "edge-id",
      "edge-en",
      "local-a",
      "local-b",
    ]);
  });

  it("returns an empty list without voices", () => {
    expect(naturalFirstVoices([])).toEqual([]);
  });

  it("prefers a natural voice matching the utterance language", () => {
    const voices = [
      local("local-id"),
      natural("natural-id"),
      natural("natural-en", "en-US"),
    ];
    expect(selectNaturalPreferredVoice(voices, "id-ID")?.id).toBe("natural-id");
  });

  it("falls back to any natural voice, then any voice", () => {
    const onlyLocal = [local("local-id")];
    expect(selectNaturalPreferredVoice(onlyLocal, "id-ID")?.id).toBe(
      "local-id",
    );
    expect(selectNaturalPreferredVoice([], "id-ID")).toBeUndefined();
  });
});
