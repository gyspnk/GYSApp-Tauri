import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

type Catalog = { items: Array<Record<string, unknown>> };

let catalogPromise: Promise<Catalog> | undefined;

function loadCatalog() {
  catalogPromise ??= readFile(
    new URL("../public/offline/hymn-metadata.json", import.meta.url),
    "utf8",
  ).then((contents) => JSON.parse(contents) as Catalog);
  return catalogPromise;
}

// The shipped catalogue only carries the KR collection. Adding one English
// entry gives the listbox two options without installing a distributed pack.
async function openCatalogWithEnglish(page: Page) {
  const catalog = await loadCatalog();
  const sample = catalog.items[0]!;
  await page.route("**/offline/hymn-metadata.json", (route) =>
    route.fulfill({
      json: {
        ...catalog,
        items: [
          ...catalog.items,
          {
            ...sample,
            id: "hymn-e001",
            book: "english",
            number: 1,
            title: "Amazing Grace",
          },
        ],
      },
    }),
  );
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pujian-list > li").first()).toBeVisible({
    timeout: 20_000,
  });
}

function collectionSelect(page: Page) {
  return page.getByRole("combobox", { name: "Koleksi", exact: true });
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalogWithEnglish(page);
});

test("keyboard opens the listbox on the selected collection", async ({
  page,
}) => {
  const select = collectionSelect(page);
  await expect(select).toHaveAttribute("aria-haspopup", "listbox");
  await expect(select).toHaveAttribute("aria-expanded", "false");

  await select.focus();
  await select.press("Enter");

  await expect(select).toHaveAttribute("aria-expanded", "true");
  const listbox = page.getByRole("listbox", { name: "Koleksi", exact: true });
  await expect(listbox).toBeVisible();

  const english = page.getByRole("option", { name: /^English/ });
  const kr = page.getByRole("option", { name: /^KR/ });
  await expect(kr).toBeFocused();
  await expect(kr).toHaveAttribute("aria-selected", "true");
  await expect(english).toHaveAttribute("aria-selected", "false");
  await expect(
    page.locator('.control-select-option[aria-selected="true"]'),
  ).toHaveCount(1);

  await page.keyboard.press("ArrowUp");
  await expect(english).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(listbox).toBeHidden();
  await expect(select).toHaveAttribute("aria-expanded", "false");
  await expect(select).toContainText("KR");
  await expect(select).toBeFocused();
});

test("arrows and Enter choose a collection without moving page focus", async ({
  page,
}) => {
  const select = collectionSelect(page);
  await select.focus();
  await select.press("Space");
  await expect(
    page.getByRole("listbox", { name: "Koleksi", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("option", { name: /^KR/ })).toBeFocused();

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  await expect(select).toContainText("English");
  await expect(select).toBeFocused();
  await expect(page.locator('.pujian-item[data-id="hymn-e001"]')).toBeVisible();
  await expect(page.locator('.pujian-item[data-id="hymn-001"]')).toHaveCount(0);

  await select.press("Enter");
  await expect(page.getByRole("option", { name: /^English/ })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");

  await expect(select).toContainText("KR");
  await expect(select).toBeFocused();
  await expect(page.locator('.pujian-item[data-id="hymn-001"]')).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).not.toBeFocused();
});

test("Tab leaves the listbox and closes it", async ({ page }) => {
  const select = collectionSelect(page);
  await select.focus();
  await select.press("Enter");
  await expect(page.getByRole("option", { name: /^KR/ })).toBeFocused();

  await page.keyboard.press("Tab");

  await expect(
    page.getByRole("listbox", { name: "Koleksi", exact: true }),
  ).toBeHidden();
  await expect(page.getByRole("option")).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(document.activeElement?.closest(".control-select")),
      ),
    )
    .toBe(false);
});
