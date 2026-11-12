import { expect, test } from "@playwright/test";

// The hero used to repeat what the three doors underneath already said: a
// sentence and a title. Only the date stays on screen, as the greeting.
test.describe("home greeting", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("keeps one real heading and a date aligned with the doors", async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/");

    const date = page.locator(".home-date");
    await expect(date).toBeVisible({ timeout: 20_000 });
    await expect(date).toContainText(/\d{4}$/);
    // The removed words still exist for assistive tech, but take no space.
    const heading = page.locator(".home-welcome h1");
    await expect(heading).toHaveCount(1);
    await expect(heading).toHaveText("Bacaan & nyanyian");
    const headingBox = (await heading.boundingBox()) ?? { width: 0, height: 0 };
    expect(Math.max(headingBox.width, headingBox.height)).toBeLessThanOrEqual(
      1,
    );
    await expect(page.locator(".home-welcome .page-intro h1")).toHaveCount(1);

    const dateBox = (await date.boundingBox())!;
    const portalBox = (await page.locator(".home-portals").boundingBox())!;
    expect(Math.abs(dateBox.x - portalBox.x)).toBeLessThanOrEqual(1);
    expect(dateBox.y).toBeLessThan(portalBox.y);
  });

  test("puts the date and the doors on one line when there is room", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/");

    const date = (await page.locator(".home-date").boundingBox())!;
    const portal = (await page.locator(".home-portals").boundingBox())!;
    const overlapsVertically =
      date.y < portal.y + portal.height && date.y + date.height > portal.y;
    expect(overlapsVertically, "the greeting shares the doors' row").toBe(true);
    // Date on the left, doors on the right, both inside the content column.
    expect(date.x).toBeLessThan(portal.x);
  });
});
