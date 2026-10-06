import { expect, test } from "@playwright/test";
for (const reduced of [false, true]) {
  test(`theme preserves reading position and settings, reduced=${reduced}`, async ({
    page,
  }) => {
    await page.emulateMedia({
      reducedMotion: reduced ? "reduce" : "no-preference",
    });
    await page.addInitScript(() => {
      const start = document.startViewTransition.bind(document);
      document.startViewTransition = (callback) => {
        (window as Window & { themeScrollStart: number }).themeScrollStart =
          scrollY;
        return start(callback);
      };
    });
    await page.goto("/GYSApp-Tauri/lainnya");
    await page.locator('[data-setting="appearance"] > summary').click();
    const select = page.locator(".appearance-setting-select").first();
    await select.locator(".control-select-trigger").click();
    await select
      .getByRole("option", { name: "Gelap", exact: true })
      .evaluate((element) => {
        element.addEventListener(
          "click",
          () => {
            (window as Window & { themeScrollStart: number }).themeScrollStart =
              scrollY;
          },
          { once: true },
        );
      });
    await select.getByRole("option", { name: "Gelap", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect
      .poll(() =>
        page.evaluate(() =>
          document.documentElement.classList.contains("is-theme-transition"),
        ),
      )
      .toBe(false);
    expect(
      Math.abs(
        (await page.evaluate(() => scrollY)) -
          (await page.evaluate(
            () =>
              (window as Window & { themeScrollStart: number })
                .themeScrollStart,
          )),
      ),
    ).toBeLessThan(2);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
}
