import { describe, expect, it } from "vitest";
import {
  detectPreloadTransposeFromPdfText,
  extractPdfKeyFromText,
  extractPdfTempoFromText,
  isBlackKeySemitone,
  MIDI_TEMPO_FALLBACK_BPM,
  normalizeDetectedTempoBpm,
  parsePdfKeyToSemitone,
} from "./pdf-meta.js";

describe("PDF tempo extraction (gyschordweb parity)", () => {
  it("reads the symbol notation ♩= with a numeric value", () => {
    expect(extractPdfTempoFromText("Kidung Rohani 76 ♩= 96")).toBe(96);
    expect(extractPdfTempoFromText("Q:=88")).toBe(88);
  });

  it("reads tempo/bpm labels", () => {
    expect(extractPdfTempoFromText("Tempo: 120")).toBe(120);
    expect(extractPdfTempoFromText("BPM 140")).toBe(140);
  });

  it("falls back to a loose = NN pattern", () => {
    expect(extractPdfTempoFromText("Halaman 4 = 77 q quarter")).toBe(77);
  });

  it("clamps unusual values into the 30-220 range and falls back to 76", () => {
    expect(normalizeDetectedTempoBpm(999)).toBe(220);
    expect(normalizeDetectedTempoBpm(2)).toBe(30);
    expect(extractPdfTempoFromText("tak ada tempo di sini")).toBe(
      MIDI_TEMPO_FALLBACK_BPM,
    );
  });
});

describe("PDF key extraction (gyschordweb parity)", () => {
  it("detects do= and la= keys", () => {
    expect(extractPdfKeyFromText("Nada dasar do=G")).toBe("G");
    expect(extractPdfKeyFromText("la=Am 4/4 lagu")).toBe("Am");
  });

  it("detects meter-signature followed by a key letter", () => {
    expect(extractPdfKeyFromText("4/4 F major")).toBe("F");
    expect(extractPdfKeyFromText("3/4 Dm allegro")).toBe("Dm");
  });

  it("parses natural-letter and German-style keys", () => {
    expect(parsePdfKeyToSemitone("C")).toBe(0);
    expect(parsePdfKeyToSemitone("cis")).toBe(1);
    expect(parsePdfKeyToSemitone("des")).toBe(1);
    expect(parsePdfKeyToSemitone("es")).toBe(3);
    expect(parsePdfKeyToSemitone("ges")).toBe(6);
    expect(parsePdfKeyToSemitone("H")).toBe(11);
    expect(parsePdfKeyToSemitone("Am")).toBe(9);
  });

  it("maps black keys for natural-chord preload transpose", () => {
    expect(isBlackKeySemitone(1)).toBe(true);
    expect(isBlackKeySemitone(0)).toBe(false);
    expect(detectPreloadTransposeFromPdfText("do=Gis")).toBe(-1);
    expect(detectPreloadTransposeFromPdfText("do=C")).toBe(0);
    expect(detectPreloadTransposeFromPdfText("tidak ada kunci")).toBe(0);
  });
});
