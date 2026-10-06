import { expect, test, type Page } from "@playwright/test";

// Representative visual baselines cover phone, tablet, and desktop widths.
const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

const surfaces = [
  {
    name: "home",
    path: "/GYSApp-Tauri/",
    ready: ".home-grid",
    fold: ".continue-panel",
  },
  {
    name: "kidung",
    path: "/GYSApp-Tauri/kidung",
    ready: ".hymn-catalog-shell",
    fold: ".pujian-list > li",
  },
  {
    name: "bible",
    path: "/GYSApp-Tauri/bible",
    ready: ".reader-search-btn",
    fold: ".bible-reader article",
  },
  {
    name: "more",
    path: "/GYSApp-Tauri/lainnya",
    ready: ".more-page",
    fold: ".more-settings-list",
  },
  {
    name: "assets",
    path: "/GYSApp-Tauri/lainnya?section=data",
    ready: ".distributed-assets-list",
    fold: ".distributed-assets-list",
  },
  {
    name: "reader",
    path: "/GYSApp-Tauri/kidung/hymn-001",
    ready: ".hymn-detail-page",
    fold: ".lyrics-sheet",
  },
] as const;
const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

async function prepare(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-08-18T08:00:00+07:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", async (route) => {
    if (route.request().resourceType() === "image") return route.abort();
    await route.abort();
  });
  await page.route("https://tjcorguploads.s3.amazonaws.com/**", (route) =>
    route.fulfill({ body: transparentPixel, contentType: "image/png" }),
  );
}

for (const surface of surfaces) {
  for (const viewport of viewports) {
    test(`${surface.name} ${viewport.name} visual baseline`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      await prepare(page);
      await page.goto(surface.path);
      await page.locator(surface.ready).first().waitFor({
        state: "visible",
        timeout: 20_000,
      });
      await page.waitForTimeout(250);

      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);
      if (surface.name === "home" && viewport.width === 390) {
        await expect
          .poll(
            () =>
              page
                .locator(".home-suara-shelf .suara-thumb-img")
                .first()
                .evaluate((image) => image.complete && image.naturalWidth > 0),
            { timeout: 5_000 },
          )
          .toBe(true);
      }
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(
        page.getByRole("navigation", { name: "Navigasi utama" }),
      ).toHaveCount(surface.name === "reader" ? 0 : 1);
      if (viewport.width <= 390) {
        const undersizedTargets = await page
          .locator(
            ".search-trigger, .account-button, .topbar-select .control-select-trigger, .navigation-shell .nav-item, .more-cat-btn, .primary-button, .quiet-button",
          )
          .evaluateAll((elements) =>
            elements.flatMap((element) => {
              const rect = element.getBoundingClientRect();
              return rect.width > 0 &&
                rect.height > 0 &&
                (rect.width < 43.5 || rect.height < 43.5)
                ? [
                    `${element.tagName}.${element.className}: ${rect.width}x${rect.height}px`,
                  ]
                : [];
            }),
          );
        expect(undersizedTargets).toEqual([]);
      }
      await expect
        .poll(() =>
          page
            .locator(surface.fold)
            .first()
            .evaluate(
              (element) => element.getBoundingClientRect().top < innerHeight,
            ),
        )
        .toBe(true);

      if (surface.name === "assets") {
        const topbar = await page.locator(".topbar").boundingBox();
        const heading = await page
          .getByRole("heading", { name: "Manajemen Aset" })
          .boundingBox();
        expect(topbar).not.toBeNull();
        expect(heading).not.toBeNull();
        expect(heading!.y).toBeGreaterThanOrEqual(topbar!.y + topbar!.height);
      }

      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(
        `${surface.name}-${viewport.name}.png`,
        {
          animations: "disabled",
          caret: "hide",
          mask:
            surface.name === "home"
              ? [
                  page.locator(
                    ".home-page .date-line, .home-page .sauh-source, .home-page .sauh-image, .home-page .suara-card img, .home-page .suara-library-item img",
                  ),
                ]
              : [],
          maskColor: "#ded6c8",
          maxDiffPixelRatio: 0.005,
        },
      );
    });
  }
}

for (const viewport of [
  { name: "320x720", width: 320, height: 720 },
  viewports[0],
  viewports[2],
]) {
  test(`Appearance settings ${viewport.name} visual baseline`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.goto("/GYSApp-Tauri/lainnya");

    await page.locator('[data-setting="appearance"] > summary').click();
    const accent = page.locator('[data-setting="accent"]');
    const palette = accent.locator(".accent-palette-grid");
    await expect(
      page.getByRole("combobox", { name: "Pilih Tema" }),
    ).toBeVisible();
    await expect(palette).toBeHidden();
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(
      `appearance-settings-${viewport.name}.png`,
      { animations: "disabled", caret: "hide" },
    );

    await accent.locator(":scope > summary").click();
    await expect(palette).toBeVisible();
    await expect(page.locator(".theme-pill-grid")).toHaveCount(0);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await page.waitForTimeout(250);

    await expect(page).toHaveScreenshot(
      `appearance-accent-${viewport.name}.png`,
      { animations: "disabled", caret: "hide" },
    );
  });
}

for (const viewport of [viewports[0], viewports[2]]) {
  test(`Bible search ${viewport.name} visual baseline`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.goto("/GYSApp-Tauri/bible");
    await page.locator(".bible-reader").waitFor({ state: "visible" });
    await page
      .getByRole("button", { name: "Buka pencarian ayat di Alkitab" })
      .click();
    await expect(page.getByLabel("Cari Alkitab")).toBeFocused();
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
      );
    });
    // Locator clicks can scroll the sticky trigger; capture from page top.
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
    await expect(page).toHaveScreenshot(`bible-search-${viewport.name}.png`, {
      animations: "disabled",
      caret: "hide",
    });
  });
}

test("Bible search filters 1440x900 visual baseline", async ({ page }) => {
  await page.setViewportSize(viewports[2]);
  await prepare(page);
  await page.goto("/GYSApp-Tauri/bible");
  await page.locator(".bible-reader").waitFor({ state: "visible" });
  const searchTrigger = page.getByRole("button", {
    name: "Buka pencarian ayat di Alkitab",
  });
  await searchTrigger.click();
  await expect(page.getByLabel("Cari Alkitab")).toBeFocused();
  await page.waitForTimeout(250);
  // Locator clicks can scroll the sticky trigger by a few pixels before firing.
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const filters = page.locator(".bible-search-options-disclosure");
  await filters.locator(":scope > summary").click();
  await expect(filters).toHaveAttribute("open", "");
  await expect(page.getByLabel("Cari Alkitab")).toBeInViewport();
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
    );
  });
  await expect(page).toHaveScreenshot("bible-search-filters-1440x900.png", {
    animations: "disabled",
    caret: "hide",
  });
});

test("Bible notes 390x844 visual baseline", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await prepare(page);
  await page.goto("/GYSApp-Tauri/bible");
  await page.locator(".reader-search-btn").waitFor({ state: "visible" });
  await page.locator(".reader-hamburger-btn").click();
  const drawer = page.locator(".reader-hamburger-drawer");
  await expect(drawer).toBeVisible();
  await drawer
    .getByRole("button", { name: "Catatan ayat", exact: true })
    .click();
  await expect(page.locator(".bible-notes-modal")).toBeVisible();
  await expect(page).toHaveScreenshot("bible-notes-390x844.png", {
    animations: "disabled",
    caret: "hide",
  });
});

for (const viewport of [viewports[0], viewports[2]]) {
  test(`Kidung reader More ${viewport.name} visual baseline`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await page.locator(".hymn-text-toolbar").waitFor({ state: "visible" });
    await page.locator(".hymn-more-actions-summary").click();
    const panel = page.locator(".hymn-more-actions-panel");
    await expect(panel).toBeVisible();
    await expect(panel.locator(".hymn-segmented-toolbar")).toBeVisible();
    await expect(panel.locator(".hymn-reader-settings-summary")).toBeVisible();
    await page.waitForTimeout(250);
    await expect(page).toHaveScreenshot(
      `kidung-reader-more-${viewport.name}.png`,
      { animations: "disabled", caret: "hide" },
    );
  });
}

test("Kidung reader settings 390x844 visual baseline", async ({ page }) => {
  await page.setViewportSize(viewports[0]);
  await prepare(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await page.locator(".hymn-text-toolbar").waitFor({ state: "visible" });
  await page.locator(".hymn-more-actions-summary").click();
  const panel = page.locator(".hymn-more-actions-panel");
  await expect(panel).toBeVisible();
  await panel.locator(".hymn-reader-settings-summary").click();
  await expect(
    panel.locator(".hymn-reader-settings > .song-controls"),
  ).toBeVisible();
  await page.waitForTimeout(250);
  await expect(page).toHaveScreenshot("kidung-reader-settings-390x844.png", {
    animations: "disabled",
    caret: "hide",
  });
});

for (const viewport of [viewports[0], viewports[2]]) {
  test(`Kidung PDF ${viewport.name} visual baseline`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
    ).toBeVisible({ timeout: 15_000 });
    await page.getByRole("tab", { name: "PDF" }).click();
    const pdf = page.locator(".pdf-reader-hymn");
    await expect(pdf).toBeVisible({ timeout: 30_000 });
    await expect(
      pdf.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible({ timeout: 30_000 });
    await expect(page.locator(".toast")).toHaveCount(0, { timeout: 5_000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
      );
    });
    if (viewport.width <= 599) {
      const title = page.locator(".hymn-pdf-viewer-title strong");
      await expect
        .poll(() =>
          title.evaluate(
            (element) =>
              element.clientWidth / (element.parentElement?.clientWidth ?? 1),
          ),
        )
        .toBeGreaterThan(0.85);
      await expect
        .poll(() =>
          title.evaluate((element) =>
            Number.parseFloat(element.style.fontSize),
          ),
        )
        .toBeGreaterThanOrEqual(11);
    }
    await expect(page).toHaveScreenshot(`kidung-pdf-${viewport.name}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    });
  });
}

test("hymn PDF viewer renders a verified page and exposes a download", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pdf-download")).toHaveAttribute(
    "download",
    /Pujilah Allah/,
  );
  await expect
    .poll(
      () =>
        page
          .locator(".pdf-pages canvas")
          .first()
          .evaluate((canvas) => canvas.width),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.locator(".pdf-pages canvas").first()).toHaveAttribute(
    "aria-label",
    /Halaman PDF \d+/,
  );
});
