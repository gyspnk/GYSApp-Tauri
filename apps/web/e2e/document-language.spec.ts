import { expect, test } from "@playwright/test";

/** The document language drives hyphenation, screen-reader pronunciation and
 *  the browser's own spell-check. It was set once from the shell settings and
 *  never checked, so a reader who switched to English kept an Indonesian
 *  document for the whole session. */
const LOCALES = [
  { locale: "id", lang: "id" },
  { locale: "en", lang: "en" },
  { locale: "zh", lang: "zh" },
] as const;

test.describe("document language", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
  });

  for (const { locale, lang } of LOCALES) {
    test(`follows the shell locale (${locale})`, async ({ page }) => {
      await page.addInitScript((value: string) => {
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({
            version: 1,
            locale: value,
            theme: "light",
            onboarded: true,
          }),
        );
      }, locale);
      await page.goto("/GYSApp-Tauri/");
      await expect(page.locator(".home-portals")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator("html")).toHaveAttribute("lang", lang);
    });
  }

  test("changes when the reader picks another language", async ({ page }) => {
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
    await page.goto("/GYSApp-Tauri/");
    await expect(page.locator(".home-portals")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator("html")).toHaveAttribute("lang", "id");

    await page.getByRole("combobox", { name: /bahasa|language/i }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });
});
