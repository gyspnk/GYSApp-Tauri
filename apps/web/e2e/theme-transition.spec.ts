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
    await expect(page.locator('[data-setting="appearance"]')).toHaveAttribute(
      "open",
      "",
    );
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

test("theme snapshots stop smooth focus scroll before the lazy module loads", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const start = document.startViewTransition.bind(document);
    document.startViewTransition = (callback) => {
      (window as Window & { themeScrollStart: number }).themeScrollStart =
        scrollY;
      return start(callback);
    };
  });
  await page.route("**/theme-transition-*.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue();
  });
  await page.goto("/GYSApp-Tauri/lainnya");
  await page.locator('[data-setting="appearance"] > summary').click();
  const select = page.locator(".appearance-setting-select").first();
  await select.locator(".control-select-trigger").click();
  await select
    .getByRole("option", { name: "Gelap", exact: true })
    .evaluate((option) => {
      window.scrollTo({ top: 123, behavior: "instant" });
      window.scrollTo({ top: 400, behavior: "smooth" });
      // The pending scroll must stop on selection, before the delayed import.
      (option as HTMLElement).click();
    });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page.evaluate(() =>
        document.documentElement.classList.contains("is-theme-transition"),
      ),
    )
    .toBe(false);
  const position = await page.evaluate(() => ({
    start: (window as Window & { themeScrollStart: number }).themeScrollStart,
    end: scrollY,
  }));
  expect(position.start).toBeGreaterThan(0);
  expect(position.start).toBeLessThan(400);
  expect(Math.abs(position.end - position.start)).toBeLessThan(2);
});
