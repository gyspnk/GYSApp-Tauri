import { expect, test } from "@playwright/test";

/**
 * The catalogue used to hide its type filter in a dropdown and to lay its rows
 * out in two columns on a desktop. Both are now contracts: a chip row with
 * 44 px targets, and a three-column grid once the page is wide enough.
 */
test.describe("literature catalogue", () => {
  test.beforeEach(async ({ page }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
  });

  test("type chips filter the catalogue with 44 px targets", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/literatur");

    const group = page.getByRole("group", { name: "Kategori" });
    await expect(group).toBeVisible();
    const chips = group.getByRole("button");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "true");

    const count = await chips.count();
    expect(count).toBeGreaterThan(1);
    for (let index = 0; index < count; index += 1) {
      const box = await chips.nth(index).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }

    const rows = page.locator(".literature-row");
    const before = await rows.count();
    expect(before).toBeGreaterThan(0);

    await chips.nth(1).click();
    await expect(chips.nth(1)).toHaveAttribute("aria-pressed", "true");
    await expect(chips.first()).toHaveAttribute("aria-pressed", "false");

    const after = await rows.count();
    expect(after).toBeGreaterThan(0);
    expect(after).toBeLessThanOrEqual(before);
  });

  test("desktop catalogue fills three columns", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/GYSApp-Tauri/literatur");
    await expect(page.locator(".literature-row").first()).toBeVisible();

    const columns = await page
      .locator(".literature-list")
      .first()
      .evaluate(
        (list) =>
          getComputedStyle(list).gridTemplateColumns.split(" ").filter(Boolean)
            .length,
      );
    expect(columns).toBe(3);
  });
});
