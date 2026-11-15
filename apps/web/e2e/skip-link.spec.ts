import { expect, test } from "@playwright/test";

/** The skip link is the first control a keyboard user meets, and it was 41 px
 *  tall — under the shell's hit floor — while every other control in the
 *  header met it. It also has to stay reachable and to land on the content. */
test.describe("skip link", () => {
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

  for (const width of [390, 1440]) {
    test(`is the first stop and meets the hit floor at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/GYSApp-Tauri/");
      await expect(page.locator(".home-portals")).toBeVisible({
        timeout: 30_000,
      });

      await page.keyboard.press("Tab");
      const focused = page.locator(":focus");
      await expect(focused).toHaveClass(/skip-link/);
      const box = (await focused.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
      // It has to be on screen while focused, not parked above the viewport.
      expect(box.y).toBeGreaterThanOrEqual(0);

      await page.keyboard.press("Enter");
      await expect(page.locator("main#main-content")).toBeFocused();
    });
  }
});
