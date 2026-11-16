import { expect, test } from "@playwright/test";

// The shell ships four themes, but it ignored the OS-level "increase contrast"
// switch: a reader who needs it got the same hairlines as everyone else. This
// contract emulates that switch and asks the two tokens that carry a label or a
// boundary to reach the stricter floor (7:1 and 4,5:1), then checks the default
// palette did not get quietly stronger.

const THEMES = ["light", "dark", "amoled", "sepia"] as const;

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: "light",
        onboarded: true,
      }),
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
});

async function tokens(page: import("@playwright/test").Page, theme: string) {
  await page.goto("/GYSApp-Tauri/lainnya?section=appearance");
  await page.evaluate((next) => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: next,
        onboarded: true,
      }),
    );
  }, theme);
  await page.reload();
  await expect(page.locator("[data-setting='appearance']")).toBeVisible();
  return page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    const read = (name: string) => style.getPropertyValue(name).trim();
    return {
      more: matchMedia("(prefers-contrast: more)").matches,
      muted: read("--muted"),
      lineStrong: read("--line-strong"),
      surface: read("--surface"),
      soft: read("--surface-soft"),
    };
  });
}

function ratio(first: string, second: string): number {
  const parse = (value: string) => {
    let hex = value.trim().replace("#", "");
    if (hex.length === 3) {
      hex = hex
        .split("")
        .map((part) => part + part)
        .join("");
    }
    const number = Number.parseInt(hex, 16);
    const channel = (shift: number) => ((number >> shift) & 255) / 255;
    const linear = (value: number) =>
      value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    return (
      0.2126 * linear(channel(16)) +
      0.7152 * linear(channel(8)) +
      0.0722 * linear(channel(0))
    );
  };
  const light = parse(first) + 0.05;
  const dark = parse(second) + 0.05;
  return Math.max(light, dark) / Math.min(light, dark);
}

test.describe("the shell follows the OS contrast preference", () => {
  for (const theme of THEMES) {
    test(`${theme} raises labels to 7:1 and edges to 4,5:1`, async ({
      page,
    }) => {
      await page.emulateMedia({ contrast: "more" });
      const value = await tokens(page, theme);
      expect(
        value.more,
        "the emulated preference must reach the page, or this contract proves nothing",
      ).toBe(true);
      expect(ratio(value.muted, value.surface)).toBeGreaterThanOrEqual(7);
      expect(ratio(value.lineStrong, value.surface)).toBeGreaterThanOrEqual(
        4.5,
      );
      expect(ratio(value.lineStrong, value.soft)).toBeGreaterThanOrEqual(4.5);
    });
  }

  test("the default palette keeps its own ratios", async ({ page }) => {
    await page.emulateMedia({ contrast: "no-preference" });
    for (const theme of THEMES) {
      const value = await tokens(page, theme);
      expect(value.more).toBe(false);
      // The base palette is a 4,5:1 label and a 3:1 edge, not the tighter pair.
      expect(ratio(value.muted, value.surface)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(value.muted, value.surface)).toBeLessThan(7);
      expect(ratio(value.lineStrong, value.surface)).toBeGreaterThanOrEqual(3);
      expect(ratio(value.lineStrong, value.surface)).toBeLessThan(4.5);
    }
  });
});
