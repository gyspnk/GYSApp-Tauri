import { describe, expect, it } from "vitest";
import {
  chordFillPaint,
  chordSurface,
  chordTextPaint,
  DEFAULT_CHORD_UI_PREFS,
  type ChordUiPrefs,
} from "./chord-ui-prefs.js";

const prefs = (over: Partial<ChordUiPrefs> = {}): ChordUiPrefs => ({
  ...DEFAULT_CHORD_UI_PREFS,
  ...over,
});

describe("chord marker paint", () => {
  it("lifts the marker toward the theme ink instead of one fixed navy", () => {
    expect(chordTextPaint(prefs(), "#00719c", "light")).toBe(
      "color-mix(in srgb, #0b4c99 66%, var(--ink))",
    );
    expect(chordTextPaint(prefs(), "#00719c", "dark")).toBe(
      "color-mix(in srgb, #0b4c99 42%, var(--ink))",
    );
    expect(chordTextPaint(prefs(), "#00719c", "amoled")).toBe(
      "color-mix(in srgb, #0b4c99 50%, var(--ink))",
    );
  });

  it("keeps the accent path on the same lift", () => {
    expect(
      chordTextPaint(prefs({ syncThemeWithAccent: true }), "#00719c", "dark"),
    ).toBe("color-mix(in srgb, #00719c 42%, var(--ink))");
  });

  it("tints the chip toward the surface it sits on", () => {
    expect(chordFillPaint(prefs(), "#00719c", "light")).toBe(
      "color-mix(in srgb, #b8dbff 32%, #ffffff)",
    );
    expect(chordFillPaint(prefs(), "#00719c", "dark")).toBe(
      "color-mix(in srgb, #b8dbff 5%, var(--surface))",
    );
    expect(chordFillPaint(prefs({ fill: "solid" }), "#00719c", "amoled")).toBe(
      "color-mix(in srgb, #b8dbff 10%, var(--surface))",
    );
  });

  it("leaves the chip transparent when the reader turned fills off", () => {
    expect(chordFillPaint(prefs({ fill: "none" }), "#00719c", "dark")).toBe(
      "transparent",
    );
  });

  it("maps every named theme, and follows the media query for system", () => {
    expect(chordSurface("sepia")).toBe("sepia");
    expect(chordSurface("amoled")).toBe("amoled");
    expect(chordSurface("dark")).toBe("dark");
    expect(chordSurface("light")).toBe("light");
    const media = { matches: true } as { matches: boolean };
    const original = globalThis.matchMedia;
    globalThis.matchMedia = (() => media) as unknown as typeof matchMedia;
    try {
      expect(chordSurface("system")).toBe("dark");
      media.matches = false;
      expect(chordSurface("system")).toBe("light");
    } finally {
      globalThis.matchMedia = original;
    }
  });
});
