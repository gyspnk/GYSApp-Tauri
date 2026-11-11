export type Rgb = { r: number; g: number; b: number };
export type Rgba = Rgb & { a: number };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

function unsupported(value: string): never {
  throw new Error(`Unsupported CSS color: ${value}`);
}

function channel(part: string, value: string): number {
  const numeric = Number.parseFloat(part);
  if (!Number.isFinite(numeric)) unsupported(value);
  return clamp(part.endsWith("%") ? numeric * 2.55 : numeric, 0, 255);
}

function alpha(part: string): number {
  const numeric = Number.parseFloat(part);
  if (!Number.isFinite(numeric)) unsupported(part);
  return clamp(part.endsWith("%") ? numeric / 100 : numeric, 0, 1);
}

/**
 * Reads the color strings Chromium puts in `getComputedStyle`: `rgb()`,
 * `rgba()`, hex, `transparent`, and the `color(srgb ...)` form that
 * `color-mix()` serializes to.
 */
export function parseCssColor(value: string): Rgba {
  const input = value.trim().toLowerCase();
  if (input === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  if (input.startsWith("#")) {
    const hex = input.slice(1);
    if (!/^[0-9a-f]+$/.test(hex) || ![3, 4, 6, 8].includes(hex.length)) {
      unsupported(value);
    }
    const step = hex.length <= 4 ? 1 : 2;
    const parts: string[] = [];
    for (let index = 0; index < hex.length; index += step) {
      const part = hex.slice(index, index + step);
      parts.push(step === 1 ? part + part : part);
    }
    return {
      r: Number.parseInt(parts[0]!, 16),
      g: Number.parseInt(parts[1]!, 16),
      b: Number.parseInt(parts[2]!, 16),
      a: parts[3] === undefined ? 1 : Number.parseInt(parts[3], 16) / 255,
    };
  }

  const rgb = /^rgba?\(([^)]*)\)$/.exec(input);
  if (rgb) {
    const [channels, slashAlpha] = rgb[1]!.split("/");
    const parts = channels!
      .trim()
      .split(/[,\s]+/)
      .filter(Boolean);
    if (parts.length !== 3 && parts.length !== 4) unsupported(value);
    return {
      r: channel(parts[0]!, value),
      g: channel(parts[1]!, value),
      b: channel(parts[2]!, value),
      a: slashAlpha ? alpha(slashAlpha) : parts[3] ? alpha(parts[3]) : 1,
    };
  }

  const srgb = /^color\(srgb\s+([^)]*)\)$/.exec(input);
  if (srgb) {
    const [channels, slashAlpha] = srgb[1]!.split("/");
    const parts = channels!.trim().split(/\s+/).filter(Boolean);
    if (parts.length !== 3) unsupported(value);
    const channels255 = parts.map((part) => {
      const numeric = Number.parseFloat(part);
      if (!Number.isFinite(numeric)) unsupported(value);
      const unit = part.endsWith("%") ? numeric / 100 : numeric;
      return clamp(unit, 0, 1) * 255;
    });
    return {
      r: channels255[0]!,
      g: channels255[1]!,
      b: channels255[2]!,
      a: slashAlpha ? alpha(slashAlpha) : 1,
    };
  }

  unsupported(value);
}

/** Flattens a translucent foreground over an already opaque background. */
export function composite(foreground: Rgba, background: Rgb): Rgb {
  const opacity = clamp(foreground.a, 0, 1);
  return {
    r: foreground.r * opacity + background.r * (1 - opacity),
    g: foreground.g * opacity + background.g * (1 - opacity),
    b: foreground.b * opacity + background.b * (1 - opacity),
  };
}

function linear(value: number): number {
  const channelValue = clamp(value, 0, 255) / 255;
  return channelValue <= 0.03928
    ? channelValue / 12.92
    : ((channelValue + 0.055) / 1.055) ** 2.4;
}

function luminance(color: Rgb): number {
  return (
    0.2126 * linear(color.r) +
    0.7152 * linear(color.g) +
    0.0722 * linear(color.b)
  );
}

/** WCAG 2.x contrast ratio: 1 for identical colors, 21 for black on white. */
export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
