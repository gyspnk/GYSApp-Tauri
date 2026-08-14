import { expect, test } from "@playwright/test";

test.describe("Quiet Sanctuary visual regression", () => {
  test("Kidung desktop keeps the primary layout stable", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".hymn-page")).toHaveScreenshot(
      "kidung-desktop.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.02,
      },
    );
  });

  test("Kidung mobile keeps navigation and controls inside the viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".hymn-page")).toHaveScreenshot(
      "kidung-mobile.png",
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.02,
      },
    );
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  });
});
