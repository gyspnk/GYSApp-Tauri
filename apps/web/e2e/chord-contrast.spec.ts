import { expect, test, type Page } from "@playwright/test";
import { composite, contrastRatio, parseCssColor } from "../src/contrast.js";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

const THEMES = ["light", "dark", "amoled", "sepia"] as const;

async function openChords(page: Page, theme: string) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.addInitScript((value) => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: value }),
    );
    localStorage.setItem("gys-lyrics-show-chords", "0");
  }, theme);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(page.locator(".chord-visual-marker").first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Resolve a computed colour, compositing any alpha over the page surface. */
function solid(value: string, surface: string) {
  const parsed = parseCssColor(value);
  return parsed.a < 1 ? composite(parsed, parseCssColor(surface)) : parsed;
}

for (const theme of THEMES) {
  test(`chord markers stay readable on the ${theme} surface`, async ({
    page,
  }) => {
    await openChords(page, theme);
    const measured = await page.evaluate(() => {
      const marker = document.querySelector<HTMLElement>(
        ".chord-visual-marker",
      )!;
      const style = getComputedStyle(marker);
      const sheet = marker.closest<HTMLElement>(
        ".lyrics-sheet, .all-verses-sheet",
      )!;
      return {
        color: style.color,
        chip: style.backgroundColor,
        sheet: getComputedStyle(sheet).backgroundColor,
        body: getComputedStyle(document.body).backgroundColor,
      };
    });
    const surface = measured.sheet.startsWith("rgba(0, 0, 0, 0)")
      ? measured.body
      : measured.sheet;
    const chip = measured.chip.startsWith("rgba(0, 0, 0, 0)")
      ? surface
      : measured.chip;
    const ratio = contrastRatio(
      solid(measured.color, chip),
      solid(chip, surface),
    );
    console.log(
      `[chord] ${theme} ${measured.color} on ${chip} = ${ratio.toFixed(2)}`,
    );
    expect(
      ratio,
      `${theme}: ${measured.color} on ${chip} measured ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(4.5);
  });
}
