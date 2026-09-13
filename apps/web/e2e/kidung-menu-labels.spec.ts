import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test(
  "phone Kidung More menu shows readable action labels",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
    ).toBeVisible({ timeout: 20_000 });

    await page.locator(".hymn-more-actions-summary").click();
    const panel = page.locator(".hymn-more-actions-panel");
    await expect(panel).toBeVisible();

    const labels = panel.locator(".hymn-action-label");
    expect(await labels.count()).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(labels.nth(index)).toBeVisible();
      await expect(labels.nth(index)).not.toHaveText(/^\s*$/);
    }
  },
);
