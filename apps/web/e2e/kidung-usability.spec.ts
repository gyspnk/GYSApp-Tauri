import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Contextual Kidung menus share the same 44px minimum target as primary chrome.
async function expectTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box, "control should be visible and measurable").not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min - 0.5);
  expect(box!.height).toBeGreaterThanOrEqual(min - 0.5);
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function openCatalog(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(
    page.getByRole("heading", { name: "Kidung", exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await page
    .locator(".pujian-list > li")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function openFirstHymn(page: Page) {
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });
}

async function openPlaylistWithSong(page: Page) {
  await openCatalog(page);
  await page.locator(".add-to-playlist-btn").first().click();
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await page
    .locator(".kidung-playlist-list > li")
    .first()
    .waitFor({ state: "visible", timeout: 20_000 });
}

async function openFirstHymnPdf(page: Page) {
  await openFirstHymn(page);
  await page.getByRole("tab", { name: "PDF" }).click();
  await page.locator(".gys-pdf-overlay").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  await page.locator(".pdf-reader").waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const renderedPage = page.locator('.pdf-reader canvas[aria-label^="PDF page"]').first();
  await expect(renderedPage).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        renderedPage.evaluate((canvas) => {
          const pageCanvas = canvas as HTMLCanvasElement;
          return pageCanvas.width > 0 && pageCanvas.height > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.locator(".gys-pdf-overlay > .loading-panel")).toHaveCount(0);
}

test(
  "phone Kidung catalog prioritizes search, compact filtering, and large library rows",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openCatalog(page);

    const localLinks = page.locator(".kidung-local-nav a");
    for (let index = 0; index < (await localLinks.count()); index += 1) {
      await expectTarget(localLinks.nth(index));
    }

    const search = page.locator(".hymn-catalog-controls .search-field");
    const searchBox = await search.boundingBox();
    expect(searchBox).not.toBeNull();
    expect(searchBox!.width).toBeGreaterThanOrEqual(340);

    await expect(page.locator(".kidung-desktop-filter")).toBeHidden();
    const filterTrigger = page.locator(
      'summary[aria-label="Koleksi"]',
    );
    await expectTarget(filterTrigger);
    await filterTrigger.click();
    const filterPanel = page.locator(".kidung-mobile-filter-panel");
    await expect(filterPanel).toBeVisible();
    await expectTarget(filterPanel.locator(".control-select-trigger"));

    const firstOpen = page.locator(".pujian-title").first();
    const firstNumber = page.locator(".pujian-nomor").first();
    await expect(firstOpen).toBeVisible();
    const openBox = await firstOpen.boundingBox();
    const numberBox = await firstNumber.boundingBox();
    expect(openBox).not.toBeNull();
    expect(numberBox).not.toBeNull();
    expect(openBox!.height).toBeGreaterThanOrEqual(56);
    expect(openBox!.width).toBeGreaterThanOrEqual(230);
    expect(openBox!.x).toBeLessThanOrEqual(numberBox!.x);
    expect(openBox!.x + openBox!.width).toBeGreaterThanOrEqual(
      numberBox!.x + numberBox!.width,
    );
    await expect(firstOpen).toContainText("Pujilah Allah Yang Maha Esa");

    await expectTarget(page.locator(".add-to-playlist-btn").first());
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "small-phone hymn titles stay readable instead of shrinking to fit one line",
  async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await openCatalog(page);

    const titles = page.locator(".pujian-title");
    for (let index = 0; index < Math.min(5, await titles.count()); index += 1) {
      const title = titles.nth(index);
      const computed = await title.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: Number.parseFloat(style.fontSize),
          lineHeight: Number.parseFloat(style.lineHeight),
          whiteSpace: style.whiteSpace,
        };
      });
      expect(computed.fontSize).toBeGreaterThanOrEqual(13);
      expect(computed.lineHeight).toBeGreaterThanOrEqual(16);
      expect(computed.whiteSpace).not.toBe("nowrap");
      await expectTarget(title, 44);
    }
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "phone hymn reader keeps only contextual primary actions on the surface",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstHymn(page);

    const actions = page.locator(
      ".hymn-text-toolbar .detail-actions .hymn-action",
    );
    const actionCount = await actions.count();
    expect(actionCount).toBeGreaterThan(0);
    expect(actionCount).toBeLessThanOrEqual(2);
    for (let index = 0; index < actionCount; index += 1) {
      await expectTarget(actions.nth(index));
    }

    const labels = page.locator(
      ".hymn-text-toolbar .detail-actions .hymn-action-label",
    );
    for (let index = 0; index < (await labels.count()); index += 1) {
      await expect(labels.nth(index)).toBeVisible();
    }

    const more = page.locator(".hymn-more-actions-summary");
    await expectTarget(more);
    await more.click();
    await expect(
      page.getByRole("button", { name: "Mode lirik layar penuh" }),
    ).toBeVisible();

    await expectTarget(page.locator(".hymn-reader-settings-summary"));
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "playlist rows keep low-frequency actions behind one touch-friendly menu",
  async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openPlaylistWithSong(page);

    const row = page.locator(".kidung-playlist-list > li").first();
    const menu = row.locator('summary[aria-label^="Opsi"]');
    await expectTarget(menu);
    await menu.click();
    const panel = row.locator(".kidung-row-menu-panel");
    await expect(panel).toBeVisible();

    const buttons = panel.getByRole("button");
    expect(await buttons.count()).toBeGreaterThanOrEqual(4);
    for (let index = 0; index < (await buttons.count()); index += 1) {
      await expectTarget(buttons.nth(index));
    }

    await expect(panel.getByRole("button", { name: "Naikkan" })).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Turunkan" }),
    ).toBeVisible();
    await expect(
      panel.getByRole("button", { name: "Buka kidung" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "PDF reader exposes contextual music controls with direct song navigation",
  async ({ page }) => {
    test.setTimeout(75_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await openFirstHymnPdf(page);

    const chrome = page.locator(".hymn-pdf-viewer-chrome");
    await expect(
      chrome.getByRole("button", { name: "Sebelumnya", exact: true }),
    ).toBeVisible();
    await expect(
      chrome.getByRole("button", { name: "Berikutnya", exact: true }),
    ).toBeVisible();

    const music = chrome.locator('summary[aria-label="Opsi musik"]');
    await expectTarget(music);
    await music.click();
    const panel = chrome.locator(".pdf-music-menu-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".pdf-transpose-inline")).toBeVisible();
    await expectNoHorizontalOverflow(page);
  },
);

test(
  "phone hymn reader keeps only frequent actions visible and moves fullscreen lyrics into overflow",
  async ({ page }) => {
    for (const viewport of [
      { width: 320, height: 720 },
      { width: 390, height: 844 },
    ]) {
      await page.setViewportSize(viewport);
      await openFirstHymn(page);

      for (const tab of await page.getByRole("tab").all()) {
        await expectTarget(tab);
      }

      const actions = page.locator(
        ".hymn-text-toolbar .detail-actions .hymn-action:visible",
      );
      // MIDI is intentionally hidden until the optional SoundFont is
      // installed. The chord control remains available, so the compact
      // toolbar should expose one or two contextual primary actions depending
      // on the device's installed capabilities.
      const actionCount = await actions.count();
      expect(actionCount).toBeGreaterThanOrEqual(1);
      expect(actionCount).toBeLessThanOrEqual(2);
      for (let index = 0; index < actionCount; index += 1) {
        await expectTarget(actions.nth(index));
      }

      const labels = actions.locator(".hymn-action-label");
      await expect(labels).toHaveCount(actionCount);
      for (let index = 0; index < (await labels.count()); index += 1) {
        await expect(labels.nth(index)).toBeVisible();
      }

      const toolbarBox = await page
        .locator(".hymn-text-toolbar")
        .boundingBox();
      expect(toolbarBox).not.toBeNull();
      expect(toolbarBox!.height).toBeLessThanOrEqual(118);

      const fullscreenLyrics = page.getByRole("button", {
        name: "Mode lirik layar penuh",
      });
      await expect(fullscreenLyrics).toBeHidden();

      const overflow = page.locator(".hymn-more-actions-summary");
      await expectTarget(overflow);
      await overflow.click();
      await expect(fullscreenLyrics).toBeVisible();
      await expectTarget(fullscreenLyrics);

      const panel = page.locator(".hymn-more-actions-panel");
      await expect(panel).toBeVisible();
      const panelBox = await panel.boundingBox();
      const fullscreenBox = await fullscreenLyrics.boundingBox();
      expect(panelBox).not.toBeNull();
      expect(fullscreenBox).not.toBeNull();
      expect(fullscreenBox!.x).toBeGreaterThanOrEqual(panelBox!.x);
      expect(fullscreenBox!.x + fullscreenBox!.width).toBeLessThanOrEqual(
        panelBox!.x + panelBox!.width,
      );
      expect(fullscreenBox!.y).toBeGreaterThanOrEqual(panelBox!.y);
      expect(fullscreenBox!.y + fullscreenBox!.height).toBeLessThanOrEqual(
        panelBox!.y + panelBox!.height,
      );

      await expectTarget(page.locator(".hymn-reader-settings-summary"));
      await expectNoHorizontalOverflow(page);
    }
  },
);

test(
  "tablet and desktop hymn actions preserve labels without crowding",
  async ({ page }) => {
    for (const viewport of [
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await openFirstHymn(page);
      const labels = page.locator(
        ".hymn-text-toolbar .detail-actions .hymn-action-label",
      );
      for (let index = 0; index < (await labels.count()); index += 1) {
        await expect(labels.nth(index)).toBeVisible();
      }
      await expectNoHorizontalOverflow(page);
    }
  },
);

const visualCases = [
  ["catalog-small-phone-320x720", 320, 720, "catalog", "light"],
  ["catalog-phone-390x844", 390, 844, "catalog", "light"],
  ["catalog-large-phone-430x932", 430, 932, "catalog", "light"],
  ["catalog-tablet-768x1024", 768, 1024, "catalog", "light"],
  ["catalog-landscape-1024x768", 1024, 768, "catalog", "light"],
  ["catalog-desktop-1440x900", 1440, 900, "catalog", "light"],
  ["playlist-phone-390x844", 390, 844, "playlist", "light"],
  ["playlist-tablet-768x1024", 768, 1024, "playlist", "light"],
  ["reader-text-small-phone-320x720", 320, 720, "reader", "light"],
  ["reader-text-phone-390x844", 390, 844, "reader", "light"],
  ["reader-text-tablet-768x1024", 768, 1024, "reader", "light"],
  ["reader-text-desktop-1440x900", 1440, 900, "reader", "light"],
  ["reader-text-wide-1920x1080", 1920, 1080, "reader", "light"],
  ["reader-pdf-phone-390x844", 390, 844, "pdf", "light"],
  ["reader-pdf-tablet-768x1024", 768, 1024, "pdf", "light"],
  ["reader-pdf-desktop-1440x900", 1440, 900, "pdf", "light"],
  ["reader-dark-phone-390x844", 390, 844, "reader", "dark"],
  ["reader-dark-tablet-768x1024", 768, 1024, "reader", "dark"],
  ["playlist-menu-phone-390x844", 390, 844, "playlist-menu", "light"],
  ["reader-more-phone-390x844", 390, 844, "reader-more", "light"],
  ["reader-settings-phone-390x844", 390, 844, "reader-settings", "light"],
  ["pdf-music-phone-390x844", 390, 844, "pdf-music", "light"],
] as const;

for (const [name, width, height, surface, theme] of visualCases) {
  test(`Kidung visual ${name}`, async ({ page }) => {
    test.setTimeout(surface === "pdf" || surface === "pdf-music" ? 75_000 : 45_000);
    await page.setViewportSize({ width, height });

    if (surface === "catalog") await openCatalog(page);
    if (surface === "playlist") await openPlaylistWithSong(page);
    if (surface === "reader") await openFirstHymn(page);
    if (surface === "pdf") await openFirstHymnPdf(page);
    if (surface === "playlist-menu") {
      await openPlaylistWithSong(page);
      const row = page.locator(".kidung-playlist-list > li").first();
      await row.locator('summary[aria-label^="Opsi"]').click();
      await expect(row.locator(".kidung-row-menu-panel")).toBeVisible();
    }
    if (surface === "reader-more") {
      await openFirstHymn(page);
      await page.locator(".hymn-more-actions-summary").click();
      await expect(page.locator(".hymn-more-actions-panel")).toBeVisible();
    }
    if (surface === "reader-settings") {
      await openFirstHymn(page);
      await page.locator(".hymn-reader-settings-summary").click();
      await expect(
        page.locator(".hymn-reader-settings > .song-controls"),
      ).toBeVisible();
    }
    if (surface === "pdf-music") {
      await openFirstHymnPdf(page);
      await page.locator('summary[aria-label="Opsi musik"]').click();
      await expect(page.locator(".pdf-music-menu-panel")).toBeVisible();
    }

    await page.evaluate((nextTheme) => {
      document.documentElement.dataset.theme = nextTheme;
    }, theme);
    await expectNoHorizontalOverflow(page);
    await page.screenshot({
      path: `test-results/ui-preview/kidung-density/${name}.png`,
      fullPage: false,
      animations: "disabled",
    });
  });
}
