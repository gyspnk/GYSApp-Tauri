import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openCatalog(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible();
  await page
    .locator(".pujian-list > li")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function openFirstHymn(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible();
}

test("phone catalog moves collection filtering behind one compact trigger", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalog(page);

  await expect(
    page.locator(".kidung-desktop-filter .control-select"),
  ).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Filter koleksi" }),
  ).toBeVisible();
});

test("playlist rows expose one contextual menu instead of permanent row actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalog(page);
  await page.locator(".add-to-playlist-btn").first().click();
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");

  const row = page.locator(".kidung-playlist-list > li").first();
  await expect(row).toBeVisible();
  await expect(row.locator(".kidung-playlist-actions > button")).toHaveCount(0);
  await expect(row.locator('summary[aria-label^="Opsi"]')).toBeVisible();
});

test("text reader removes duplicate song navigation and PDF action from persistent chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);

  await expect(
    page.locator(".detail-hero .detail-neighbor-button"),
  ).toHaveCount(0);
  await expect(
    page
      .locator(".hymn-text-toolbar .detail-actions .hymn-action")
      .filter({ hasText: "PDF" }),
  ).toHaveCount(0);
});

test("reader settings prioritize typography and collapse music controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);

  const settings = page.locator(".hymn-reader-settings-summary");
  await expect(settings).toContainText("Aa");
  await settings.click();

  const panel = page.locator(".hymn-reader-settings > .song-controls");
  await expect(panel.locator(".hymn-reading-settings")).toHaveAttribute(
    "open",
    "",
  );
  await expect(
    panel.locator(".hymn-reading-settings .reader-preferences"),
  ).toBeVisible();
  await expect(panel.locator(".hymn-music-settings")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(
    panel.locator(".hymn-music-settings .transpose-control"),
  ).toBeHidden();
});

test("PDF reader keeps navigation and transpose out of permanent top chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);
  await page.getByRole("tab", { name: "PDF" }).click();
  await page.locator(".gys-pdf-overlay").waitFor({ state: "visible" });

  const chrome = page.locator(".hymn-pdf-viewer-chrome");
  await expect(
    chrome.getByRole("button", { name: "Sebelumnya", exact: true }),
  ).toHaveCount(0);
  await expect(
    chrome.getByRole("button", { name: "Berikutnya", exact: true }),
  ).toHaveCount(0);
  await expect(chrome.locator(".pdf-transpose-inline")).toBeHidden();
  await expect(
    chrome.locator('summary[aria-label="Opsi musik"]'),
  ).toBeVisible();
});
