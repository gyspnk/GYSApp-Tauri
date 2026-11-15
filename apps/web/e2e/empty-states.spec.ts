import { expect, test } from "@playwright/test";

/** Every list that can be filtered says what to do when nothing matches. The
 *  copy is only honest if the card also offers the action it names: a card that
 *  says "change the keyword" without a way to clear it is a dead end. */
const SURFACES = [
  { name: "kidung", path: "/kidung", ready: ".pujian-list .pujian-item" },
  { name: "literatur", path: "/literatur", ready: ".page-intro h1" },
  { name: "suara", path: "/suara", ready: ".page-intro h1" },
  { name: "iman", path: "/iman", ready: ".faith-rows" },
] as const;

test.describe("empty search results", () => {
  for (const surface of SURFACES) {
    test(`${surface.name} offers a way out of an empty search`, async ({
      page,
    }) => {
      await page.route(/^https:\/\//, (route) => route.abort());
      await page.goto(`/GYSApp-Tauri${surface.path}`);
      await expect(page.locator(surface.ready).first()).toBeVisible({
        timeout: 30_000,
      });

      const field = page
        .locator(
          "input[type='search'], .search-field input, .faith-search-bar input, .hymn-search-field input",
        )
        .first();
      await field.fill("zzzqqq");

      const card = page
        .locator(
          ".empty-state, .empty-panel, .kidung-empty-state, .faith-empty",
        )
        .filter({ hasNot: page.locator("[hidden]") })
        .first();
      await expect(card).toBeVisible({ timeout: 10_000 });

      const action = card.locator("button, a").first();
      await expect(action).toBeVisible();
      const box = (await action.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(43.5);

      await action.click();
      await expect(card).toHaveCount(0);
      await expect(field).toHaveValue("");
    });
  }
});

test.describe("empty queue", () => {
  test("the way out of an empty queue is a tap target", async ({ page }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung?section=playlist");
    await expect(page.locator(".kidung-index-toolbar").first()).toBeVisible({
      timeout: 30_000,
    });

    const card = page.locator(".kidung-empty-state").first();
    await expect(card).toBeVisible({ timeout: 10_000 });

    // The card ends in a link, and a link is only as tall as its text.
    const link = card.locator("a.text-button").first();
    await expect(link).toBeVisible();
    const box = (await link.boundingBox())!;
    expect(box.height).toBeGreaterThanOrEqual(43.5);

    await link.click();
    await expect(page).toHaveURL(/\/kidung$/);
  });
});
