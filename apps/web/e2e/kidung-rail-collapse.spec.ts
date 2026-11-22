import { expect, test } from "@playwright/test";

test.describe("kidung left rail collapse on desktop and landscape tablet", () => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 700 },
  ]) {
    test(`collapses and expands left song list at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await page.route(/^https:\/\//, (route) => route.abort());
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");

      const rail = page.locator(".kidung-reader-rail");
      await expect(rail).toBeVisible({ timeout: 30_000 });
      const collapseBtn = rail.locator(".kidung-rail-toggle");
      await expect(collapseBtn).toBeVisible();
      const collapseBox = (await collapseBtn.boundingBox())!;
      expect(collapseBox.width).toBeGreaterThanOrEqual(44);
      expect(collapseBox.height).toBeGreaterThanOrEqual(44);

      const paneBefore = (await page
        .locator(".kidung-reader-pane")
        .boundingBox())!;
      await collapseBtn.click();

      const expandBtn = page.locator(".kidung-rail-expand-btn");
      await expect(expandBtn).toBeVisible();
      await expect(rail).toHaveClass(/is-collapsed/);
      const expandBox = (await expandBtn.boundingBox())!;
      expect(expandBox.width).toBeGreaterThanOrEqual(44);
      expect(expandBox.height).toBeGreaterThanOrEqual(44);

      await expect
        .poll(
          async () =>
            (await page.locator(".kidung-reader-pane").boundingBox())!.width,
        )
        .toBeGreaterThan(paneBefore.width + 150);

      await expect
        .poll(() =>
          page.evaluate(
            () =>
              document.documentElement.scrollWidth <=
              document.documentElement.clientWidth + 1,
          ),
        )
        .toBe(true);

      await page.reload();
      await expect(page.locator(".kidung-rail-expand-btn")).toBeVisible({
        timeout: 30_000,
      });
      await expect(rail).toHaveClass(/is-collapsed/);

      await page.locator(".kidung-rail-expand-btn").click();
      await expect(rail).not.toHaveClass(/is-collapsed/);
      await expect(page.locator(".kidung-rail-expand-btn")).toHaveCount(0);
    });
  }

  test("keeps active high-numbered hymn visible in the rail and transfers focus cleanly on toggle", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung/hymn-200?mode=lyrics");

    const rail = page.locator(".kidung-reader-rail");
    await expect(rail).toBeVisible({ timeout: 30_000 });
    const activeRow = rail.locator('.kidung-rail-row[aria-current="page"]');
    await expect(activeRow).toHaveCount(1);
    await expect(activeRow).toBeVisible();

    const collapseBtn = rail.locator(".kidung-rail-toggle");
    await collapseBtn.focus();
    await collapseBtn.press("Enter");

    const expandBtn = page.locator(".kidung-rail-expand-btn");
    await expect(expandBtn).toBeVisible();
    await expect(expandBtn).toBeFocused();

    await expandBtn.press("Enter");
    await expect(rail).not.toHaveClass(/is-collapsed/);
    await expect(collapseBtn).toBeFocused();
    await expect(expandBtn).toHaveCount(0);
  });
});
