import { test, expect } from "@playwright/test";

const SETTINGS = "/GYSApp-Tauri/lainnya";

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
});

test("settings read as three labelled groups with touch-sized rows", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(SETTINGS);

  const list = page.locator(".more-settings-list");
  await expect(list).toBeVisible();

  for (const label of ["Tampilan", "Konten & unduhan", "Tentang & Bantuan"]) {
    await expect(
      list.getByRole("heading", { name: label, exact: true }),
    ).toBeVisible();
  }

  const row = list.locator(".more-setting-row").first();
  const box = await row.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(64);
});

test("desktop lays the settings out in two columns", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(SETTINGS);

  const list = page.locator(".more-settings-list");
  await expect(list).toBeVisible();
  const columns = await list.evaluate((node) => {
    const value = getComputedStyle(node).gridTemplateColumns;
    return value.split(" ").filter(Boolean).length;
  });
  expect(columns).toBe(2);
});
