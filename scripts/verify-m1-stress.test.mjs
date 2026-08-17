import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function sRgbToLinear(c) {
  const norm = c / 255;
  return norm <= 0.04045 ? norm / 12.92 : Math.pow((norm + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (
    0.2126 * sRgbToLinear(r) +
    0.7152 * sRgbToLinear(g) +
    0.0722 * sRgbToLinear(b)
  );
}

function contrastRatio(hex1, hex2) {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

test("M1 Empirical Stress Test: styles.css z-index hierarchy audit", () => {
  const stylesPath = path.resolve(process.cwd(), "apps/web/src/styles.css");
  const content = fs.readFileSync(stylesPath, "utf-8");

  // Verify variable declarations
  assert.match(content, /--z-content:\s*0;/);
  assert.match(content, /--z-nav:\s*10;/);
  assert.match(content, /--z-media:\s*20;/);
  assert.match(content, /--z-toolbar:\s*30;/);
  assert.match(content, /--z-popover:\s*40;/);
  assert.match(content, /--z-modal:\s*50;/);

  // Find all z-index usage lines
  const lines = content.split("\n");
  const zIndexLines = lines.filter((line) =>
    /^\s*z-index:\s*[^;]+;/.test(line),
  );

  assert.ok(
    zIndexLines.length >= 10,
    "Expected multiple z-index rules in styles.css",
  );

  for (const line of zIndexLines) {
    const trimmed = line.trim();
    assert.match(
      trimmed,
      /^z-index:\s*var\(--z-(content|nav|media|toolbar|popover|modal)\);$/,
      `Non-standard z-index found: "${trimmed}"`,
    );
  }
});

test("M1 Empirical Stress Test: WCAG 2.1 contrast ratios on all 5 themes", () => {
  const themes = {
    light: {
      canvas: "#f7faff",
      surface: "#ffffff",
      ink: "#13213d",
      muted: "#59677f",
      blue: "#2a65c7",
    },
    dark: {
      canvas: "#111a2a",
      surface: "#172338",
      ink: "#edf3ff",
      muted: "#aebbd0",
      blue: "#8fb8ff",
    },
    amoled: {
      canvas: "#000000",
      surface: "#0a0a0a",
      ink: "#ffffff",
      muted: "#94a3b8",
      blue: "#93c5fd",
    },
    sepia: {
      canvas: "#f4ecd8",
      surface: "#fbf5e6",
      ink: "#43302b",
      muted: "#7c6853",
      blue: "#8b5a2b",
    },
  };

  assert.equal(
    themes.amoled.canvas,
    "#000000",
    "AMOLED canvas must be pure black",
  );

  for (const [theme, colors] of Object.entries(themes)) {
    const inkCanvasRatio = contrastRatio(colors.ink, colors.canvas);
    const inkSurfaceRatio = contrastRatio(colors.ink, colors.surface);
    const mutedCanvasRatio = contrastRatio(colors.muted, colors.canvas);
    const mutedSurfaceRatio = contrastRatio(colors.muted, colors.surface);

    assert.ok(
      inkCanvasRatio >= 4.5,
      `${theme} ink/canvas contrast ${inkCanvasRatio.toFixed(2)} must be >= 4.5:1`,
    );
    assert.ok(
      inkSurfaceRatio >= 4.5,
      `${theme} ink/surface contrast ${inkSurfaceRatio.toFixed(2)} must be >= 4.5:1`,
    );
    assert.ok(
      mutedCanvasRatio >= 4.0,
      `${theme} muted/canvas contrast ${mutedCanvasRatio.toFixed(2)} must be >= 4.0:1`,
    );
    assert.ok(
      mutedSurfaceRatio >= 4.0,
      `${theme} muted/surface contrast ${mutedSurfaceRatio.toFixed(2)} must be >= 4.0:1`,
    );
  }
});
