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

  expect(rowBox.width).toBeLessThanOrEqual(cap + 1);
  expect(rowBox.width).toBeGreaterThanOrEqual(cap - 1);
  expect(Math.abs(searchBox.width - rowBox.width)).toBeLessThanOrEqual(1);
  expect(rowBox.height).toBeGreaterThanOrEqual(44);
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
