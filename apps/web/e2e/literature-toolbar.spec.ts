import { expect, test } from "@playwright/test";

// The sort select used to auto-place into the row under the chips and stretch
// across the whole first column: at 1440 it measured 980 px wide and pushed the
// shelf 58 px down. It belongs beside the search field, in the 180 px track.

test("the literature toolbar keeps the sort control beside the search", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: "light",
        onboarded: true,
      }),
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/literatur");

  const search = page.locator(".literature-toolbar > .search-field");
  const sort = page.locator(".literature-toolbar > .control-select");
  const chips = page.locator(
    ".literature-toolbar > .literature-category-chips",
  );
  await expect(search).toBeVisible({ timeout: 30_000 });
  await expect(sort).toBeVisible();

  const searchBox = await search.boundingBox();
  const sortBox = await sort.boundingBox();
  const chipsBox = await chips.boundingBox();
  if (!searchBox || !sortBox || !chipsBox) throw new Error("toolbar missing");

  // Same row, side by side: the grid aligns items on their bottom edge, since
  // the sort carries its own label and is therefore taller than the search.
  const searchBottom = searchBox.y + searchBox.height;
  const sortBottom = sortBox.y + sortBox.height;
  expect(Math.abs(sortBottom - searchBottom)).toBeLessThanOrEqual(1);
  expect(sortBox.width).toBeLessThanOrEqual(220);
  expect(sortBox.width).toBeGreaterThanOrEqual(140);
  expect(sortBox.x).toBeGreaterThanOrEqual(searchBox.x + searchBox.width - 1);
  // The chips keep their own row under both.
  expect(chipsBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height - 1);
  // The trigger is a real 44 px target.
  const trigger = await sort.locator(".control-select-trigger").boundingBox();
  expect(trigger!.height).toBeGreaterThanOrEqual(44);
});

test("the literature toolbar stacks on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: "light",
        onboarded: true,
      }),
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/literatur");

  const search = page.locator(".literature-toolbar > .search-field");
  const sort = page.locator(".literature-toolbar > .control-select");
  await expect(search).toBeVisible({ timeout: 30_000 });
  const searchBox = await search.boundingBox();
  const sortBox = await sort.boundingBox();
  if (!searchBox || !sortBox) throw new Error("toolbar missing");

  expect(sortBox.y).toBeGreaterThanOrEqual(searchBox.y + searchBox.height - 1);
  expect(sortBox.width).toBeLessThanOrEqual(220);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("a landscape phone sees the shelf, not only the tool stack", async ({
  page,
}) => {
  // 390 px of height: search, chips and the sort with its painted label used to
  // fill y 74-437, so the page showed no book at all. The sort now shares the
  // search's row and keeps only its accessible name.
  await page.setViewportSize({ width: 844, height: 390 });
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: "id",
        theme: "light",
        onboarded: true,
      }),
    );
  });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/literatur");

  const search = page.locator(".literature-toolbar > .search-field");
  const sort = page.locator(".literature-toolbar > .control-select");
  await expect(search).toBeVisible({ timeout: 30_000 });
  const searchBox = (await search.boundingBox())!;
  const sortBox = (await sort.boundingBox())!;
  expect(Math.abs(sortBox.y - searchBox.y)).toBeLessThanOrEqual(1);
  expect(sortBox.x).toBeGreaterThanOrEqual(searchBox.x + searchBox.width - 1);
  expect(sortBox.height).toBeLessThanOrEqual(52);

  // The sort keeps its accessible name even though its painted label is gone.
  await expect(page.getByRole("combobox", { name: "Urutkan" })).toBeVisible();

  // Some content reached the fold: the featured shelf or the catalogue itself.
  const shelfTop = await page
    .locator(".literature-featured, .literature-shelf")
    .first()
    .evaluate((node) => node.getBoundingClientRect().top);
  expect(shelfTop).toBeLessThan(390);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
});
