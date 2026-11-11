import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

test("coming back from a hymn returns to where the catalogue was left", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  const rows = page.locator(".pujian-item");
  await expect(rows.first()).toBeVisible();
  await page.mouse.move(195, 520);
  await page.mouse.wheel(0, 2400);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(2300);

  // The row is already in view: scrolling it into view here would lower the
  // offset we are about to restore and make the assertion lie.
  const target = rows.nth(41);
  await expect(target).toBeInViewport();
  await target.locator(".pujian-title").click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible();

  await page.goBack();
  await expect(rows.first()).toBeAttached();
  // The catalogue reopens with a screenful and appends the rest while idle; the
  // offset can only be honoured once the list is tall enough to hold it.
  await expect
    .poll(() => rows.count(), { timeout: 15_000 })
    .toBeGreaterThan(100);
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 15_000 })
    .toBeGreaterThan(2300);
  await expect(target).toBeInViewport();
  // Focus stays where the reader is looking, not on the off-screen heading.
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.tagName ?? ""))
    .not.toBe("H1");
});

test("a fresh forward navigation still opens at the top", async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-item").first()).toBeVisible();
  await page.mouse.move(195, 520);
  await page.mouse.wheel(0, 2400);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(2300);

  await page.locator(".pujian-item .pujian-title").nth(41).click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
});
