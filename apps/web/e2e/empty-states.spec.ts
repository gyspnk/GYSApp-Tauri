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
