import { expect, test, type Page } from "@playwright/test";

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth <=
      document.documentElement.clientWidth + 1,
  );
}

test.describe("responsive reader navigation", () => {
  test("Kidung catalog keeps search and collection controls usable on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".reader-context-bar")).toBeVisible();
    await expect(page.locator(".brand-mark")).toHaveCount(0);

    const search = page.getByRole("textbox", { name: "Cari lagu" });
    await expect(search).toBeVisible();
    await expect
      .poll(() =>
        search.evaluate((element) => element.getBoundingClientRect().width),
      )
      .toBeGreaterThan(200);
    await expect(page.getByRole("button", { name: "Koleksi" })).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.getByRole("button", { name: "Buka pencarian lagu" }).click();
    await expect(search).toBeFocused();
    await search.fill("Allah Pujilah");
    await expect(
      page.getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible();
  });

  test("compact navigation exposes destination names and hymn actions stay labeled", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(".reader-context-bar")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Buka daftar kidung" }),
    ).toBeVisible();

    const navLabels = await page
      .locator("nav.primary-nav .nav-item")
      .evaluateAll((items) =>
        items.map((item) => item.getAttribute("title")).filter(Boolean),
      );
    expect(navLabels.length).toBe(5);

    await page.setViewportSize({ width: 390, height: 844 });
    const actionLabels = page.locator(
      ".hymn-detail-page .detail-actions .hymn-action-label",
    );
    await expect(actionLabels.first()).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    await expect(
      page.locator(".hymn-detail-page .detail-actions .hymn-action-primary"),
    ).toHaveCount(0);
  });

  test("mobile hymn text mode folds secondary actions and reader settings", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });

    await expect(
      page.locator(".hymn-detail-page .detail-actions .hymn-action"),
    ).toHaveCount(2);
    await expect(page.locator(".hymn-more-actions")).toBeVisible();
    await expect(
      page.locator(".hymn-more-actions .hymn-more-actions-panel"),
    ).toBeHidden();
    await expect(page.locator(".hymn-reader-settings")).toBeVisible();
    await expect(
      page.locator(".hymn-reader-settings .song-controls"),
    ).toBeHidden();

    const modeTop = await page
      .locator(".viewer-mode-tabs")
      .evaluate((element) => element.getBoundingClientRect().top);
    const lyricsTop = await page
      .locator(".lyrics-sheet")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(modeTop).toBeLessThan(lyricsTop);
    expect(lyricsTop).toBeLessThan(760);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Kidung local navigation keeps playlist and settings in the same space", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung?section=playlist");
    await expect(
      page.getByRole("heading", { name: "Playlist", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    const localNav = page.locator(".kidung-local-nav");
    await expect(localNav.getByRole("link", { name: "Kidung" })).toBeVisible();
    await expect(
      localNav.getByRole("link", { name: "Playlist" }),
    ).toHaveAttribute("aria-current", "page");
    await localNav.getByRole("link", { name: "Pengaturan" }).click();
    await expect(
      page.getByRole("heading", { name: "Pengaturan", exact: true }),
    ).toBeVisible();
    await localNav.getByRole("link", { name: "Kidung" }).click();
    await expect(page.locator(".pujian-row").first()).toBeVisible({
      timeout: 15_000,
    });
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Kidung hides MIDI transport until its SoundFont is installed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("button", { name: "Putar MIDI", exact: true }),
    ).toHaveCount(0);
    await expect(page.locator(".media-surface")).toHaveCount(0);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("Kidung PDF mode presents a compact viewer chrome before the sheet", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: "Buka PDF" }).click();

    await expect(page.locator(".pdf-reader-hymn")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.locator(".hymn-pdf-viewer-chrome")).toBeVisible();
    await expect(page.locator(".app-frame .topbar")).toBeHidden();
    await expect(page.locator(".app-frame .navigation-shell")).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Kembali ke lirik" }),
    ).toBeVisible();
    await expect
      .poll(
        () =>
          page
            .locator(".pdf-pages canvas")
            .first()
            .evaluate((canvas) => canvas.height),
        { timeout: 30_000 },
      )
      .toBeGreaterThan(0);

    const stageTop = await page
      .locator(".pdf-reader-hymn .pdf-stage")
      .evaluate((element) => element.getBoundingClientRect().top);
    expect(stageTop).toBeLessThan(844);
    await expect
      .poll(() =>
        page
          .locator(".pdf-reader-hymn .pdf-stage")
          .evaluate((element) => element.getBoundingClientRect().height),
      )
      .toBeGreaterThan(650);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    await page.getByRole("button", { name: "Pengaturan PDF" }).click();
    await expect(page.locator(".pdf-advanced-controls.is-open")).toBeVisible();
  });

  test("Bible mobile toolbar keeps secondary controls compact", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.locator(".reader-context-bar")).toBeVisible();
    await expect(page.locator(".brand-mark")).toHaveCount(0);

    const scrubber = page.locator(".chapter-scrubber input");
    await expect(scrubber).toBeHidden();
    await expect(page.locator(".bible-reader article").first()).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);

    const bibleQuery = page.locator("#bible-query");
    await page
      .getByRole("button", { name: "Buka pencarian ayat di Alkitab" })
      .click();
    await expect(bibleQuery).toBeFocused();

    await page.getByText("Filter pencarian", { exact: true }).click();
    await expect(page.locator(".bible-search-options")).toBeVisible();

    const speechToggle = page.getByRole("button", {
      name: /pengaturan suara/i,
    });
    await expect(speechToggle).toBeVisible();
    await expect(speechToggle).toHaveAttribute("aria-expanded", "false");
  });
});
