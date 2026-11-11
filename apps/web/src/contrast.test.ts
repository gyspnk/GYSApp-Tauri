import { describe, expect, it } from "vitest";
import { composite, contrastRatio, parseCssColor } from "./contrast.js";

describe("CSS color parsing", () => {
  it("reads hex and rgb() colors", () => {
    expect(parseCssColor("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseCssColor("#1c2b3a")).toEqual({
      r: 28,
      g: 43,
      b: 58,
      a: 1,
    });
    expect(parseCssColor("rgb(88, 107, 125)")).toEqual({
      r: 88,
      g: 107,
      b: 125,
      a: 1,
    });
  });

  it("reads the rgba() form used by older computed styles", () => {
    expect(parseCssColor("rgba(28, 43, 58, 0.45)")).toEqual({
      r: 28,
      g: 43,
      b: 58,
      a: 0.45,
    });
  });

  it("reads the color(srgb) form that color-mix() computes to", () => {
    const color = parseCssColor(
      "color(srgb 0.109804 0.168627 0.227451 / 0.45)",
    );
    expect(color.r).toBeCloseTo(28, 3);
    expect(color.g).toBeCloseTo(43, 3);
    expect(color.b).toBeCloseTo(58, 3);
    expect(color.a).toBe(0.45);
  });

  it("rejects colors it cannot measure instead of guessing", () => {
    expect(() => parseCssColor("oklch(0.5 0.1 200)")).toThrow(
      "Unsupported CSS color",
    );
  });
});

describe("alpha compositing", () => {
  it("blends a translucent foreground over an opaque background", () => {
    expect(
      composite({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 }),
    ).toEqual({ r: 127.5, g: 127.5, b: 127.5 });
  });

  it("leaves an opaque foreground unchanged", () => {
    expect(
      composite({ r: 18, g: 52, b: 86, a: 1 }, { r: 255, g: 255, b: 255 }),
    ).toEqual({ r: 18, g: 52, b: 86 });
  });
});

describe("WCAG contrast", () => {
  it("scores the black-on-white extremes", () => {
    expect(
      contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }),
    ).toBeCloseTo(21, 10);
    expect(
      contrastRatio({ r: 255, g: 255, b: 255 }, { r: 255, g: 255, b: 255 }),
    ).toBeCloseTo(1, 10);
  });

  it("measures the light-theme dialog text above AA", () => {
    const text = parseCssColor("#586b7d");
    const surface = parseCssColor("#ffffff");
    expect(contrastRatio(text, surface)).toBeCloseTo(5.51, 2);
  });
});
