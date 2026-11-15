import { expect, test } from "@playwright/test";

/** Landscape phones lose the desktop rail (it needs 1200 px of columns), so the
 *  reader had no way to pick another song without walking back to the catalog.
 *  The disclosure above the text is that way, and it must close after a pick. */
test.describe("kidung reader song picker", () => {
  test("picks another song from a landscape reader and closes", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 912, height: 420 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(page.locator("h1")).toContainText("Pujilah Allah", {
      timeout: 30_000,
    });

    const picker = page.locator(".kidung-reader-picker");
    await expect(picker).toHaveCount(1);
    await expect(picker).not.toHaveAttribute("open", "");
    const summary = picker.locator("summary");
    const box = (await summary.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(44);
    // The closed bar still says which song is open.
    await expect(summary).toContainText("Pujilah Allah Yang Maha Esa");

    await summary.click();
    await expect(picker).toHaveAttribute("open", "");
    const rows = picker.locator(".kidung-rail-row");
    await expect(rows.first()).toBeVisible();
    // The list is the scroller, so it is what has to stay inside the sheet.
    const scroller = (await picker
      .locator(".kidung-reader-picker-body .kidung-rail-list")
      .boundingBox())!;
    const sheet = (await picker.boundingBox())!;
    // A landscape sheet must not swallow the whole reader.
    expect(scroller.height).toBeLessThanOrEqual(420 * 0.46 + 1);
    expect(sheet.height).toBeLessThanOrEqual(420 * 0.65);

    // The number is decorative, so the row is named by its title alone.
    await picker
      .getByRole("button", {
        name: "Pujilah Allah Yang Mahakudus",
        exact: true,
      })
      .click();
    await expect(page).toHaveURL(/\/kidung\/hymn-002/);
    await expect(picker).not.toHaveAttribute("open", "");
    await expect(page.locator("h1")).toContainText(/Mahakudus/);
  });

  test("keeps loading songs as its list scrolls", async ({ page }) => {
    await page.setViewportSize({ width: 912, height: 420 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(page.locator("h1")).toContainText("Pujilah Allah", {
      timeout: 30_000,
    });
    const picker = page.locator(".kidung-reader-picker");
    await picker.locator("summary").click();

    const rows = picker.locator(".kidung-rail-row");
    const first = await rows.count();
    expect(first).toBe(80);

    // The row loader listens on the list's own scroll event, so the list has to
    // be the element that scrolls; a scrolling body left song 81+ unreachable.
    await picker
      .locator(".kidung-rail-list")
      .evaluate((node) => node.scrollTo(0, node.scrollHeight));
    await expect.poll(() => rows.count()).toBeGreaterThan(80);
  });

  test("stays out of the way on a phone and on a desktop", async ({ page }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    for (const [width, height] of [
      [390, 844],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width: width!, height: height! });
      await page.goto("/GYSApp-Tauri/kidung/hymn-001");
      await expect(page.locator("h1")).toContainText("Pujilah Allah", {
        timeout: 30_000,
      });
      await expect(page.locator(".kidung-reader-picker")).toHaveCount(0);
    }
  });
});
