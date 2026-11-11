import { expect, test } from "@playwright/test";

// Coming back from a hymn used to drop the reader at the top of a 533-row
// catalog. The offset is remembered per location and restored on a history pop.
test("back from a hymn returns to the row that opened it", async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  const rows = page.locator(".pujian-list .pujian-item");
  await rows.first().waitFor({ state: "visible" });

  await page.evaluate(() =>
    window.scrollTo({ top: 2400, behavior: "instant" }),
  );
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(2000);
  const target = rows.nth(12);
  await target.scrollIntoViewIfNeeded();
  const title = (await target.innerText()).split("\n")[1]?.trim();
  await target.click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible();

  await page.goBack();
  await expect(rows.first()).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 })
    .toBeGreaterThan(2_000);
  if (title)
    await expect(page.getByText(title, { exact: false })).toBeVisible();
});

test("a fresh visit still starts at the top", async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung");
  await page.locator(".pujian-list .pujian-item").first().waitFor();
  await page.evaluate(() =>
    window.scrollTo({ top: 1500, behavior: "instant" }),
  );
  await page.goto("/GYSApp-Tauri/lainnya");
  await page.goto("/GYSApp-Tauri/kidung");
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 5_000 })
    .toBeLessThan(50);
});
