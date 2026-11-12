import { expect, test } from "@playwright/test";

// Landscape phones give the catalogue one short row; the collection and
// section switches fold away so the list starts higher, and the toggle stays a
// 44 px target that reports its state.
test.describe("landscape catalogue toolbar", () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test("folds the collection and section switches to the left", async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.addInitScript(() => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale: "id", theme: "light" }),
      );
    });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(page.locator(".pujian-list > li").first()).toBeVisible({
      timeout: 30_000,
    });

    const toggle = page.locator(".kidung-toolbar-collapse");
    await expect(toggle).toBeVisible();
    const box = (await toggle.boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");

    const listTop = async () =>
      (await page.locator(".pujian-list").boundingBox())!.y;
    const open = await listTop();

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator(".kidung-local-nav")).toBeHidden();
    await expect(page.locator(".kidung-header-filter")).toBeHidden();
    const folded = await listTop();
    expect(folded, "folding the switches lifts the list").toBeLessThan(open);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator(".kidung-header-filter")).toBeVisible();
    expect(await listTop()).toBeCloseTo(open, 0);
  });

  test("keeps the toggle out of the way on a tall screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(page.locator(".pujian-list > li").first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".kidung-toolbar-collapse")).toBeHidden();
    await expect(page.locator(".kidung-header-filter")).toBeVisible();
  });
});
