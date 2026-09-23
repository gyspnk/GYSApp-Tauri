import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const themeCopies = {
  id: ["Otomatis", "Terang", "Gelap", "AMOLED Gelap", "Sepia Hangat"],
  en: ["Automatic", "Light", "Dark", "AMOLED Dark", "Warm Sepia"],
  zh: ["自动", "明亮", "深色", "AMOLED 深色", "暖褐"],
} as const;

async function expectTouchTarget(locator: Locator) {
  const box = await locator.boundingBox();
  expect(box, "Select control should be visible and measurable").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
}

async function expectInsideViewport(locator: Locator, viewportWidth: number) {
  const box = await locator.boundingBox();
  expect(box, "Select menu should be visible and measurable").not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(-1);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewportWidth + 1);
}

async function expectOptionsHaveTouchTargets(menu: Locator) {
  const options = menu.getByRole("option");
  const count = await options.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const option = options.nth(index);
    await expect
      .poll(async () => (await option.boundingBox())?.width ?? 0)
      .toBeGreaterThanOrEqual(44);
    await expect
      .poll(async () => (await option.boundingBox())?.height ?? 0)
      .toBeGreaterThanOrEqual(44);
    const fits = await option.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    );
    expect(fits).toBe(true);
  }
}

async function expectActiveDescendant(
  page: Page,
  trigger: Locator,
  menu: Locator,
) {
  const activeId = await trigger.getAttribute("aria-activedescendant");
  expect(activeId).toBeTruthy();
  const active = page.locator(`[id="${activeId}"]`);
  await expect(active).toHaveAttribute("role", "option");
  await expect(active).toHaveClass(/is-active/);
  await expect(active).toBeVisible();
  await expect(menu.locator(".control-select-option.is-active")).toHaveCount(1);
}

test("shared Select keeps touch, keyboard, locale, and viewport contracts", async ({
  page,
}) => {
  test.setTimeout(120_000);

  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  for (const locale of ["id", "en", "zh"] as const) {
    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto(`/GYSApp-Tauri/bible?__gys_locale=${locale}`);
      await expect(
        page.getByRole("heading", {
          name: /Kejadian 1|Genesis 1|创世记 1/,
        }),
      ).toBeVisible({ timeout: 15_000 });

      const versionTrigger = page
        .locator(".reader-version-select-wrap .control-select-trigger")
        .first();
      await expect(versionTrigger).toBeVisible();
      await expectTouchTarget(versionTrigger);
      await versionTrigger.focus();
      await page.keyboard.press("Enter");

      const versionMenu = page
        .locator(".reader-version-select-wrap .control-select-menu")
        .first();
      await expect(versionMenu).toBeVisible();
      await expectInsideViewport(versionMenu, viewport.width);
      await expectOptionsHaveTouchTargets(versionMenu);
      await expectActiveDescendant(page, versionTrigger, versionMenu);

      await page.keyboard.press("ArrowDown");
      await expectActiveDescendant(page, versionTrigger, versionMenu);
      await page.keyboard.press("Home");
      await expectActiveDescendant(page, versionTrigger, versionMenu);
      await page.keyboard.press("Enter");
      await expect(versionMenu).toHaveCount(0);
      await expect(versionTrigger).toBeFocused();

      if (viewport.width >= 600) {
        await page.goto(`/GYSApp-Tauri/?__gys_locale=${locale}`);
        const themeTrigger = page.locator(
          ".topbar-select.theme-select .control-select-trigger",
        );
        await expect(themeTrigger).toBeVisible();
        await expectTouchTarget(themeTrigger);
        await themeTrigger.focus();
        await page.keyboard.press("Enter");

        const themeMenu = page.locator(
          ".topbar-select.theme-select .control-select-menu",
        );
        await expect(themeMenu).toBeVisible();
        await expect(themeMenu.getByRole("option")).toHaveText(
          themeCopies[locale],
        );
        await expectInsideViewport(themeMenu, viewport.width);
        await expectOptionsHaveTouchTargets(themeMenu);
        await expectActiveDescendant(page, themeTrigger, themeMenu);

        await page.keyboard.press("End");
        await expectActiveDescendant(page, themeTrigger, themeMenu);
        await page.keyboard.press("Escape");
        await expect(themeMenu).toHaveCount(0);
        await expect(themeTrigger).toBeFocused();
      }

      const overflow = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
    }
  }
});
