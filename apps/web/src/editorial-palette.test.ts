import { describe, expect, it } from "vitest";
// @ts-expect-error Vitest uses Node file IO; application types target the browser.
import { readFileSync } from "node:fs";

const css = readFileSync(
  new URL("styles/00-tokens.css", import.meta.url),
  "utf8",
);

function colors(block: string): Record<string, string> {
  return Object.fromEntries(
    [...block.matchAll(/(--[a-z-]+):\s*(#[a-f\d]{6})\s*;/gi)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}

function luminance(hex: string): number {
  return [1, 3, 5]
    .map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255)
    .map((value) =>
      value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4,
    )
    .reduce(
      (sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index]!,
      0,
    );
}

function contrast(first: string, second: string): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0]! + 0.05) / (values[1]! + 0.05);
}

describe("editorial palette", () => {
  const base = colors(css.match(/:root\s*\{([^}]+)\}/)![1]!);

  for (const theme of ["light", "dark", "sepia", "amoled", "system"]) {
    it(`keeps reading and control text accessible in ${theme}`, () => {
      const block = css.match(
        new RegExp(`:root\\[data-theme="${theme}"\\]\\s*\\{([^}]+)\\}`),
      );
      const palette = { ...base, ...colors(block?.[1] ?? "") };
      for (const surface of ["--canvas", "--surface", "--surface-soft"]) {
        for (const foreground of ["--ink", "--muted", "--blue"]) {
          expect(
            contrast(palette[foreground]!, palette[surface]!),
            `${theme}: ${foreground} on ${surface}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(
        contrast(palette["--on-accent"]!, palette["--blue"]!),
      ).toBeGreaterThanOrEqual(4.5);
      if (theme === "amoled") expect(palette["--canvas"]).toBe("#000000");
      // The accent is the church's identity, so every theme must stay in the
      // same blue family: a blue-dominant hue, never the green it drifted to.
      const accent = palette["--blue"]!.slice(1);
      const [red, green, blue] = [0, 2, 4].map((offset) =>
        parseInt(accent.slice(offset, offset + 2), 16),
      ) as [number, number, number];
      expect(
        blue,
        `${theme}: accent ${palette["--blue"]} must lead with blue`,
      ).toBeGreaterThan(green);
      expect(
        green,
        `${theme}: accent ${palette["--blue"]} must not be red-shifted`,
      ).toBeGreaterThan(red);
    });
  }
});
