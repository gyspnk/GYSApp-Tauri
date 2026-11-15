import { expect, test } from "@playwright/test";

/**
 * WCAG 1.4.11 asks a control's boundary to reach 3:1 against what sits behind
 * it. The shell paints most control edges with `--line-strong`, which used to
 * be a hairline token: 1,61:1 on white in the light shell and 2,00:1 on the
 * sepia canvas, so a button read as text with a smudge around it.
 *
 * A filled control is exempt: its fill, not its border, draws the boundary.
 */

const ROUTES = [
  { path: "/", ready: ".home-portals" },
  { path: "/kidung", ready: ".pujian-list .pujian-item" },
  { path: "/kidung/hymn-001", ready: ".hymn-text-title h1" },
  { path: "/literatur", ready: ".page-intro h1" },
  { path: "/suara", ready: ".page-intro h1" },
  { path: "/iman", ready: ".faith-rows" },
  { path: "/lainnya", ready: ".more-settings-list" },
  { path: "/bible?book=kejadian&chapter=1", ready: ".verse-content" },
];

const THEMES = ["light", "dark", "amoled", "sepia"] as const;

type Sample = { label: string; border: string; background: string };

async function seed(page: import("@playwright/test").Page, theme: string) {
  await page.addInitScript((value) => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: value,
        onboarded: true,
      }),
    );
  }, theme);
  await page.route(/^https:\/\//, (route) => route.abort());
}

function channels(value: string): [number, number, number] | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1]!.split(",").map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  if ((parts[3] ?? 1) < 0.5) return null;
  return [parts[0]!, parts[1]!, parts[2]!];
}

function luminance([r, g, b]: [number, number, number]) {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(
  first: [number, number, number],
  second: [number, number, number],
) {
  const a = luminance(first);
  const b = luminance(second);
  const [high, low] = a > b ? [a, b] : [b, a];
  return (high + 0.05) / (low + 0.05);
}

test.describe("control borders", () => {
  for (const theme of THEMES) {
    test(`every control edge clears 3:1 in the ${theme} shell`, async ({
      page,
    }) => {
      await seed(page, theme);
      const weak: string[] = [];
      for (const route of ROUTES) {
        await page.goto(`/GYSApp-Tauri${route.path}`);
        await page.waitForSelector(route.ready, { timeout: 20_000 });
        await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
        const samples: Sample[] = await page.evaluate(() => {
          const found: Sample[] = [];
          const nodes = document.querySelectorAll(
            "button, a[href], input, select, textarea, .search-field, .control-select-trigger",
          );
          for (const node of nodes) {
            const box = node.getBoundingClientRect();
            if (box.width < 20 || box.height < 10) continue;
            const style = getComputedStyle(node);
            if (style.visibility === "hidden" || style.display === "none")
              continue;
            if (node.closest(".sr-only")) continue;
            if (Number.parseFloat(style.borderTopWidth) < 1) continue;
            // Colour swatches sample a palette; their edge is not a control edge.
            if (node.classList.contains("accent-palette-item")) continue;
            found.push({
              label: `${node.tagName.toLowerCase()}.${[...node.classList].join(".")}`,
              border: style.borderTopColor,
              background: style.backgroundColor,
            });
          }
          return found.slice(0, 14);
        });
        for (const sample of samples) {
          const border = channels(sample.border);
          const background = channels(sample.background);
          if (!border || !background) continue;
          // A filled control draws its boundary with the fill.
          if (border.every((value, index) => value === background[index]))
            continue;
          const ratio = contrast(border, background);
          if (ratio < 3) {
            weak.push(
              `${theme} ${route.path} ${sample.label} ${ratio.toFixed(2)}:1`,
            );
          }
        }
      }
      expect(weak).toEqual([]);
    });
  }
});
