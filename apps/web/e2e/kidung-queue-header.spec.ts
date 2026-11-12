import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 390, height: 844 } });

/** The queue used to open with a big page title and a full-width switch while
 *  the catalogue above it used one compact toolbar card. Switching tabs moved
 *  every control; this keeps both headers measuring the same. */
test("the MIDI queue keeps the catalogue's toolbar size", async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-list > li").first()).toBeVisible({
    timeout: 30_000,
  });
  const catalogueHeader = await page
    .locator(".kidung-controls-field")
    .evaluate((element) => Math.round(element.getBoundingClientRect().height));

  await page.getByRole("link", { name: "Antrean MIDI" }).first().click();
  const queue = page.locator(".kidung-tool-page");
  await expect(queue).toBeVisible({ timeout: 20_000 });

  const queueHeader = await queue
    .locator(".kidung-controls-field")
    .evaluate((element) => Math.round(element.getBoundingClientRect().height));
  // Both pages open with one 54 px card; only the catalogue adds a search row.
  expect(queueHeader).toBe(catalogueHeader);
  expect(queueHeader).toBeGreaterThanOrEqual(44);

  // One real heading per page, and it must stay in the outline.
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "Antrean MIDI" })).toHaveCount(
    1,
  );

  // The switch is compact, not a full-width segmented bar.
  const nav = await queue.locator(".kidung-local-nav").evaluate((element) => {
    const box = element.getBoundingClientRect();
    const field = element.closest(".kidung-controls-field")!;
    return {
      width: Math.round(box.width),
      fieldWidth: Math.round(field.getBoundingClientRect().width),
    };
  });
  expect(nav.width).toBeLessThan(nav.fieldWidth * 0.75);
  expect(nav.width).toBeGreaterThan(0);
});
