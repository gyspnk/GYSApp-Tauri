import { expect, test } from "@playwright/test";

test.describe("home greeting", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps one real heading and a date aligned with the doors", async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/");

    const date = page.locator(".home-date");
    await expect(date).toBeVisible({ timeout: 20_000 });
    await expect(date).toContainText(/\d{4}$/);

    const heading = page.locator(".home-welcome h1");
    await expect(heading).toHaveCount(1);
    await expect(heading).toHaveText("Beranda");
    await expect(heading).toBeVisible();
    await expect(page.locator(".home-welcome .page-intro h1")).toHaveCount(1);

    const dateBox = (await date.boundingBox())!;
    const portalBox = (await page.locator(".home-portals").boundingBox())!;
    expect(dateBox.y).toBeLessThan(portalBox.y);
  });

  test("renders the greeting and quick portals cleanly on desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/");

    const date = page.locator(".home-date");
    const heading = page.locator(".home-welcome h1");
    const portal = page.locator(".home-portals");
    await expect(date).toBeVisible({ timeout: 20_000 });
    await expect(heading).toHaveText("Beranda");
    await expect(portal).toBeVisible();
  });
});
