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
    await expect(page.locator(".hymn-catalog-shell")).toBeVisible({
      timeout: 15_000,
    });
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
    await expect(page.locator(".hymn-catalog-shell")).toBeVisible({
      timeout: 15_000,
    });
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

  test("hymn PDF viewer renders a verified page and exposes a download", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Buka PDF" }).click();
    await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".pdf-download")).toHaveAttribute(
      "download",
      /Pujilah Allah/,
    );
    await expect
      .poll(
        () =>
          page
            .locator(".pdf-pages canvas")
            .first()
            .evaluate((canvas) => canvas.width),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    await expect
      .poll(
        () =>
          page
            .locator(".pdf-pages canvas")
            .first()
            .evaluate((canvas) => canvas.height),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);
    await expect(page.locator(".pdf-pages canvas").first()).toHaveAttribute(
      "aria-label",
      /PDF page \d+/,
    );
  });
});
