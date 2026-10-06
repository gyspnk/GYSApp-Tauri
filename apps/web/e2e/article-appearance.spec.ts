import { readFileSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const suara = JSON.parse(
  readFileSync("public/offline/suara-sejati.json", "utf8"),
).items[0];
const reflection = JSON.parse(readFileSync("public/offline/sauh.json", "utf8"))
  .items[0];
const articlePreview = {
  ...suara,
  body: reflection.body,
  source: "tjc.org",
  fetchedAt: new Date().toISOString(),
};

for (const theme of ["dark", "amoled", "system"] as const) {
  for (const width of [390, 768, 1920]) {
    test(`article fills its field with readable text on ${theme} at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
      await page.addInitScript(
        ({ theme, article }) => {
          localStorage.setItem(
            "gys-shell-settings-v1",
            JSON.stringify({ version: 1, locale: "id", theme }),
          );
          localStorage.setItem(
            `gys_article_cache_${article.url}`,
            JSON.stringify(article),
          );
        },
        { theme, article: articlePreview },
      );
      await page.route(/^https:\/\//, (route) => route.abort());
      await page.route("**/offline/sauh.json", (route) =>
        route.fulfill({
          json: {
            source: "tjc.org",
            generatedAt: new Date().toISOString(),
            items: [{ ...reflection, updatedAt: new Date().toISOString() }],
          },
        }),
      );
      for (const path of [`/suara/${suara.id}`, "/sauh"]) {
        await page.goto(`/GYSApp-Tauri${path}`);
        const body = page.locator(".online-article-body");
        await expect(body).toBeVisible();
        expect(await body.evaluate((e) => getComputedStyle(e).color)).toBe(
          theme === "amoled" ? "rgb(255, 252, 245)" : "rgb(244, 238, 227)",
        );
        const card = (await page
          .locator(".online-article-card")
          .boundingBox())!;
        const field = (await page
          .locator(".online-content-page")
          .boundingBox())!;
        expect(Math.abs(card.x - field.x)).toBeLessThan(1);
        expect(Math.abs(card.width - field.width)).toBeLessThan(1);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth),
        ).toBeLessThanOrEqual(width);
        const { violations } = await new AxeBuilder({ page })
          .include(".online-article-card")
          .withRules(["color-contrast"])
          .analyze();
        expect(violations, JSON.stringify(violations)).toEqual([]);
      }
    });
  }
}
