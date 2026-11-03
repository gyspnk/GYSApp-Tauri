import { expect, test } from "@playwright/test";

async function openSearch(page: import("@playwright/test").Page) {
  await page.goto("/GYSApp-Tauri/alkitab");
  await page
    .getByRole("button", { name: "Buka pencarian ayat di Alkitab" })
    .click();
  await page.locator("#bible-query").waitFor();
  await page.locator(".bible-search-options-disclosure summary").click();
  const trigger = page.locator(".multiselect-trigger");
  await trigger.waitFor();
  return trigger;
}

test.describe("Bible search book scope", () => {
  test("several books can be selected and limit the search", async ({
    page,
  }) => {
    const trigger = await openSearch(page);
    await expect(trigger).toContainText("Semua kitab");
    await trigger.click();
    await expect(page.locator(".multiselect-menu")).toBeVisible();
    await page
      .getByRole("checkbox", { name: "Kejadian PL", exact: true })
      .check();
    await page
      .getByRole("checkbox", { name: "Yohanes PB", exact: true })
      .check();
    await expect(trigger).toContainText("2 kitab");
    await expect(page.locator(".multiselect-menu")).toBeVisible();
    await page.locator(".multiselect-footer button").click();
    await expect(page.locator(".multiselect-menu")).toHaveCount(0);

    await page.locator("#bible-query").fill("Allah");
    await page.locator("#bible-query").press("Enter");
    const results = page.locator(".result-item");
    await expect(results.first()).toBeVisible({ timeout: 30_000 });
    const books = await results.locator("strong").allInnerTexts();
    expect(books.length).toBeGreaterThan(0);
    for (const entry of books) {
      expect(entry).toMatch(/^(Kejadian|Yohanes) /);
    }
  });

  test("a testament shortcut fills the scope with its books", async ({
    page,
  }) => {
    const trigger = await openSearch(page);
    await trigger.click();
    await page.getByRole("button", { name: "Perjanjian Baru (27)" }).click();
    await expect(trigger).toContainText("Perjanjian Baru (27)");
    await page
      .getByRole("button", { name: /^Semua kitab$/ })
      .first()
      .click();
    await expect(trigger).toContainText("Semua kitab");
  });
});
