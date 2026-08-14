import { expect, test } from "@playwright/test";

test.describe("Quiet Sanctuary visual regression", () => {
  test("Home desktop renders a visual baseline surface", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible();
    const screenshot = await page.screenshot({ animations: "disabled" });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);
  });

  test("Bible mobile renders a visual smoke capture", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
      timeout: 15_000,
    });
    const screenshot = await page.screenshot({ animations: "disabled" });
    expect(screenshot.byteLength).toBeGreaterThan(10_000);
  });

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
