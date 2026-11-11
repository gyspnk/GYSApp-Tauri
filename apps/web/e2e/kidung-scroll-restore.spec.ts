import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

// The catalogue paints a screenful and appends the rest while idle, so the
// height depends on machine load. Wait for the rows before scrolling: a wheel
// event fired at a short list clamps and the assertion then measures the app's
// load, not the restore.
async function scrollDeep(page: import("@playwright/test").Page) {
  const rows = page.locator(".pujian-item");
  await expect
    .poll(() => rows.count(), { timeout: 20_000 })
    .toBeGreaterThan(100);
  await page.mouse.move(195, 520);
  await page.mouse.wheel(0, 2400);
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 10_000 })
    .toBeGreaterThan(2000);
  return page.evaluate(() => window.scrollY);
}

test("coming back from a hymn returns to where the catalogue was left", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  const rows = page.locator(".pujian-item");
  await expect(rows.first()).toBeVisible();
  const left = await scrollDeep(page);

  // The row is already in view: scrolling it into view here would lower the
  // offset we are about to restore and make the assertion lie.
  const target = rows.nth(41);
  await expect(target).toBeInViewport();
  await target.locator(".pujian-title").click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible();

  await page.goBack();
  await expect(rows.first()).toBeAttached();
  // The offset can only be honoured once the list is tall enough to hold it.
  await expect
    .poll(() => rows.count(), { timeout: 20_000 })
    .toBeGreaterThan(100);
  await expect
    .poll(() => page.evaluate(() => window.scrollY), { timeout: 20_000 })
    .toBeGreaterThanOrEqual(left - 2);
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
  await scrollDeep(page);

  await page.locator(".pujian-item .pujian-title").nth(41).click();
  await expect(page.locator(".hymn-detail-page")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThan(5);
});
