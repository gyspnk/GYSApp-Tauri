import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

const copies = [
  {
    locale: "id",
    query: "Perjanjian Lama",
    topic: "Pokok 2",
    count: /\d+ bait/,
  },
  { locale: "en", query: "redemption", topic: "Topic 1", count: /\d+ verses/ },
  { locale: "zh", query: "默示", topic: "要点 2", count: /\d+ 节/ },
] as const;

for (const width of [320, 1440]) {
  for (const copy of copies) {
    test(`search uses localized topics and icons with keyboard dismissal (${copy.locale}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.route(/^https:\/\//, (route) => route.abort());
      await page.addInitScript(
        (locale) =>
          localStorage.setItem(
            "gys-shell-settings-v1",
            JSON.stringify({ version: 1, locale, theme: "light" }),
          ),
        copy.locale,
      );
      await page.goto("/GYSApp-Tauri/iman");
      const opener = page.locator(".search-trigger");
      await opener.click();
      const dialog = page.locator(".global-search");
      const input = dialog.locator("input");
      await expect(input).toBeFocused();
      await input.fill(copy.query);
      const result = dialog
        .locator(".global-search-result:has(.is-faith)")
        .first();
      await expect(result.locator("strong")).toHaveText(copy.topic);
      await expect(result.locator(".search-result-mark svg")).toHaveCount(1);
      // Transforms/device-pixel rounding can report 43.999px for a 44px target.
      const bounds = (await dialog
        .locator(".global-search-close")
        .boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(44 - 0.01);
      expect(bounds.height).toBeGreaterThanOrEqual(44 - 0.01);
      const audit = await new AxeBuilder({ page })
        .include(".global-search")
        .analyze();
      expect(audit.violations, JSON.stringify(audit.violations)).toEqual([]);
      await input.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(opener).toBeFocused();
    });

    test(`hymn footer retains touch targets and localized full-verse count (${copy.locale}, ${width}px)`, async ({
      page,
    }) => {
      await preparePinnedReaderAssets(page);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (locale) =>
          localStorage.setItem(
            "gys-shell-settings-v1",
            JSON.stringify({ version: 1, locale, theme: "light" }),
          ),
        copy.locale,
      );
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
      const footer = page.locator(".hymn-text-footer");
      await expect(footer).toBeVisible();
      for (const button of await footer.getByRole("button").all()) {
        const bounds = (await button.boundingBox())!;
        expect(bounds.width).toBeGreaterThanOrEqual(44 - 0.01);
        expect(bounds.height).toBeGreaterThanOrEqual(44 - 0.01);
      }
      await page.locator(".hymn-more-actions-summary").click();
      await page.locator(".hymn-scope-pill-btn").first().click();
      await expect(footer.locator(".hymn-all-verses-summary")).toHaveText(
        copy.count,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    });
  }
}
