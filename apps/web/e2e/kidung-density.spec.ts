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
  await expect(page.locator('summary[aria-label="Koleksi"]')).toBeVisible();
});

test("catalog collection choices use readable names for installed books", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await openCatalog(page);

  const filter = page.locator(".kidung-desktop-filter .control-select");
  const trigger = filter.locator(".control-select-trigger");
  await trigger.click();
  await expect(filter.locator(".control-select-option")).toHaveText([
    "Semua koleksi",
    "Rohani",
  ]);
});

test("catalog lists only verified chord and MIDI metadata below each title", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalog(page);
  await expect(page.locator(".pujian-item")).toHaveCount(533);

  const firstTitle = page.locator(".pujian-title").first();
  await expect(firstTitle.locator(".pujian-title-label")).toHaveText(
    "Pujilah Allah Yang Maha Esa",
  );
  await expect(firstTitle.locator(".pujian-metadata")).toHaveText(
    "Chord · MIDI",
  );
  await expect(
    page.getByRole("button", {
      name: "Pujilah Allah Yang Maha Esa",
      exact: true,
    }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator(".pujian-item")
        .first()
        .evaluate((row) => row.getBoundingClientRect().height),
    )
    .toBeLessThanOrEqual(72);
  await expect(page.locator(".chord-indicator")).toHaveCount(0);

  await page.getByRole("searchbox", { name: "Cari lagu" }).fill("416");
  await expect(
    page.locator('.pujian-item[data-id="hymn-416"] .pujian-metadata'),
  ).toContainText("MIDI");
});

test("catalog preserves and searches lettered hymn variants", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalog(page);

  const search = page.getByRole("searchbox", { name: "Cari lagu" });
  await search.fill("051A");
  await expect(page.locator(".pujian-item")).toHaveCount(1);
  await expect(page.locator('.pujian-item[data-id="hymn-051A"]')).toBeVisible();
  await expect(
    page.locator('.pujian-item[data-id="hymn-051A"] .pujian-nomor'),
  ).toHaveText("051A");

  await search.fill("051B");
  await expect(page.locator(".pujian-item")).toHaveCount(1);
  await expect(page.locator('.pujian-item[data-id="hymn-051B"]')).toBeVisible();
  await expect(
    page.locator('.pujian-item[data-id="hymn-051B"] .pujian-nomor'),
  ).toHaveText("051B");
});

test("catalog matches upstream lyric substrings and partial song numbers", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openCatalog(page);

  const search = page.getByRole("searchbox", { name: "Cari lagu" });
  await search.fill("mon");
  await expect(page.locator(".pujian-item")).toHaveCount(2);
  await expect(page.locator('.pujian-item[data-id="hymn-300"]')).toBeVisible();
  await expect(page.locator('.pujian-item[data-id="hymn-438"]')).toBeVisible();

  await search.fill("02");
  await expect(page.locator('.pujian-item[data-id="hymn-002"]')).toBeVisible();
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

test("text reader keeps only primary actions visible until More is opened", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);

  const toolbar = page.locator(".hymn-text-toolbar");
  await expect(toolbar.locator(".hymn-segmented-toolbar")).toBeHidden();
  await expect(toolbar.locator(".hymn-reader-settings-summary")).toBeHidden();
  const actions = toolbar.locator(".detail-actions .hymn-action");
  const actionCount = await actions.count();
  expect(actionCount).toBeGreaterThanOrEqual(1);
  expect(actionCount).toBeLessThanOrEqual(2);
  if (actionCount > 1) {
    const actionRows = await actions.evaluateAll((buttons) =>
      buttons.map((button) => button.getBoundingClientRect().top),
    );
    expect(Math.abs(actionRows[0]! - actionRows[1]!)).toBeLessThanOrEqual(1);
  }
  const toolbarHeight = await toolbar.evaluate(
    (element) => element.clientHeight,
  );
  expect(toolbarHeight).toBeLessThanOrEqual(54);

  const more = toolbar.locator(".hymn-more-actions-summary");
  await more.click();
  const panel = toolbar.locator(".hymn-more-actions-panel");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".hymn-segmented-toolbar")).toBeVisible();
  const readerSettings = panel.locator(".hymn-reader-settings-summary");
  await expect(readerSettings).toBeVisible();
  await readerSettings.click();
  await expect(
    panel.locator(".hymn-reader-settings > .song-controls .reader-preferences"),
  ).toBeVisible();
});

test("reader settings prioritize typography and collapse music controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);

  await page.locator(".hymn-more-actions-summary").click();
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

test("PDF reader keeps song navigation visible and transpose contextual", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openFirstHymn(page);
  await page.getByRole("tab", { name: "PDF" }).click();
  await page.locator(".gys-pdf-overlay").waitFor({ state: "visible" });

  const chrome = page.locator(".hymn-pdf-viewer-chrome");
  await expect(
    chrome.getByRole("button", { name: "Sebelumnya", exact: true }),
  ).toBeVisible();
  await expect(
    chrome.getByRole("button", { name: "Berikutnya", exact: true }),
  ).toBeVisible();
  await expect(chrome.locator(".pdf-transpose-inline")).toBeHidden();
  await expect(
    chrome.locator('summary[aria-label="Opsi musik"]'),
  ).toBeVisible();
});
