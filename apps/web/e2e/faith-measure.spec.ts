import { expect, test } from "@playwright/test";

// The Iman page had no measure ceiling: at 1440 its rows ran 1170 px, about
// 145 characters per line, twice what the Bible reader allows. Both the rows
// and the search field now stop at the reader's 88ch roof.

const MEASURE = 88;

async function measureCap(page: import("@playwright/test").Page) {
  return page.evaluate((ch: number) => {
    const probe = document.createElement("span");
    probe.style.cssText = `position:absolute;visibility:hidden;width:${ch}ch`;
    document.body.append(probe);
    const cap = probe.getBoundingClientRect().width;
    probe.remove();
    return cap;
  }, MEASURE);
}

test("the Iman rows stop at the reader's measure on a desktop", async ({
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
  await page.goto("/GYSApp-Tauri/iman");

  const row = page.locator(".faith-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const cap = await measureCap(page);
  const rowBox = await row.boundingBox();
  const searchBox = await page.locator(".faith-search-bar").boundingBox();
  if (!rowBox || !searchBox) throw new Error("Iman measures are missing");

  // Above 900 px the list uses the page's width in two columns: each row still
  // respects the readable measure, while the surface itself fills the page.
  const rowsBox = await page.locator(".faith-rows").boundingBox();
  const pageBox = await page.locator(".faith-page").boundingBox();
  if (!rowsBox || !pageBox) throw new Error("Iman measures are missing");
  expect(rowsBox.width).toBeGreaterThanOrEqual(pageBox.width * 0.95);
  expect(rowBox.width).toBeLessThanOrEqual(cap + 1);
  expect(rowBox.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(searchBox.width - rowsBox.width)).toBeLessThanOrEqual(1);
  const ladder = page.locator(".faith-row");
  const first = await ladder.nth(0).boundingBox();
  const second = await ladder.nth(1).boundingBox();
  if (!first || !second) throw new Error("Iman rows are missing");
  expect(Math.abs(first.y - second.y)).toBeLessThanOrEqual(1);
  expect(second.x).toBeGreaterThan(first.x + first.width - 1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the Iman list stays one column in a landscape phone", async ({
  page,
}) => {
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
  await page.goto("/GYSApp-Tauri/iman");

  const row = page.locator(".faith-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const rowBox = await row.boundingBox();
  const pageBox = await page.locator(".faith-page").boundingBox();
  if (!rowBox || !pageBox) throw new Error("Iman measures are missing");
  // A landscape phone is wide but short: the rows take the page's width and
  // stay in one column, because two columns would not fit the height.
  expect(rowBox.width).toBeGreaterThan(pageBox.width * 0.95);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

test("the Iman rows still fill a phone", async ({ page }) => {
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
  await page.goto("/GYSApp-Tauri/iman");

  const row = page.locator(".faith-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  const rowBox = await row.boundingBox();
  const pageBox = await page.locator(".faith-page").boundingBox();
  if (!rowBox || !pageBox) throw new Error("Iman measures are missing");

  expect(rowBox.width).toBeGreaterThan(pageBox.width * 0.8);
  expect(rowBox.height).toBeGreaterThanOrEqual(44);
});
