import { expect, test } from "@playwright/test";

// The Suara catalogue puts its search field and sort control on one row, like
// Literatur, and stacks them on a phone. Before the round-97 fix the phone row
// squeezed the field to 257 px, where the placeholder was cut mid-word.

test.describe("suara catalogue toolbar", () => {
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

  test("keeps the search field and the sort on one row on a desktop", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/GYSApp-Tauri/suara");

    const field = page.locator(".suara-toolbar .search-field");
    const sort = page.locator(".suara-toolbar .control-select");
    await expect(field).toBeVisible({ timeout: 30_000 });
    const fieldBox = await field.boundingBox();
    const sortBox = await sort.boundingBox();
    if (!fieldBox || !sortBox) throw new Error("toolbar missing");

    expect(Math.abs(fieldBox.y - sortBox.y)).toBeLessThanOrEqual(20);
    expect(fieldBox.width).toBeGreaterThan(sortBox.width * 3);
    expect(sortBox.x).toBeGreaterThanOrEqual(fieldBox.x + fieldBox.width - 1);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test("gives the search field the whole row on a phone", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/suara");

    const field = page.locator(".suara-toolbar .search-field");
    const sort = page.locator(".suara-toolbar .control-select");
    await expect(field).toBeVisible({ timeout: 30_000 });
    const fieldBox = await field.boundingBox();
    const sortBox = await sort.boundingBox();
    if (!fieldBox || !sortBox) throw new Error("toolbar missing");

    // The field owns the row and the sort waits underneath it.
    expect(fieldBox.width).toBeGreaterThan(340);
    expect(sortBox.y).toBeGreaterThanOrEqual(fieldBox.y + fieldBox.height - 1);
    expect(sortBox.width).toBeLessThanOrEqual(220);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
