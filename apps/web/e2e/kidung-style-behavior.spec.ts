import { expect, test } from "@playwright/test";

test.use({ hasTouch: true });

for (const theme of ["light", "dark", "amoled"]) {
  test(`reader accent follows the selected theme at runtime (${theme})`, async ({
    page,
  }) => {
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(page.locator(".hymn-detail-page")).toBeVisible();
    await page.evaluate((theme) => {
      document.documentElement.dataset.theme = theme;
      document.documentElement.style.setProperty("--accent", "#307040");
    }, theme);
    const colors = await page.evaluate((theme) => {
      const reader = document.querySelector(".hymn-detail-page")!;
      const probe = document.createElement("span");
      reader.append(probe);
      probe.style.color = "var(--kidung-accent)";
      const actual = getComputedStyle(probe).color;
      probe.style.color =
        theme === "light"
          ? "var(--accent)"
          : "color-mix(in srgb, var(--accent) 80%, #ffffff)";
      const expected = getComputedStyle(probe).color;
      probe.style.color =
        "color-mix(in srgb, var(--kidung-accent) 72%, var(--ink))";
      const expectedActive = getComputedStyle(probe).color;
      const active = getComputedStyle(
        reader.querySelector(".hymn-mode-button.is-active")!,
      ).color;
      probe.remove();
      return { actual, expected, active, expectedActive };
    }, theme);
    expect(colors.actual).toBe(colors.expected);
    await expect(page.locator(".hymn-mode-button.is-active")).toHaveCSS(
      "color",
      colors.expectedActive,
    );
  });
}

test("catalog rows and navigation stay flat when hovered", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/kidung");
  const row = page.locator(".pujian-item").first();
  await expect(row).toBeVisible();
  await expect(row).toHaveCSS("border-radius", "0px");
  await row.hover();
  await expect(row).toHaveCSS("box-shadow", "none");
  await expect(row).toHaveCSS("transform", "none");
  const link = page.locator(".kidung-local-nav a").first();
  await link.hover();
  await expect(link).toHaveCSS("transform", "none");
});

for (const locale of ["id", "en", "zh"] as const) {
  test(`PDF chrome has localized touch navigation and scoped enhancements (${locale})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await page.addInitScript((locale) => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale, theme: "light" }),
      );
      localStorage.setItem(
        "gys-hymn-view-mode-v1",
        JSON.stringify({ version: 1, modes: { "hymn-001": "pdf" } }),
      );
    }, locale);
    await page.route("https://raw.githubusercontent.com/**", (route) =>
      route.abort(),
    );
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(
      page.locator("canvas[data-pdf-rendered='true']").first(),
    ).toBeVisible({ timeout: 20000 });
    const labels = {
      id: {
        previous: "Sebelumnya",
        next: "Berikutnya",
        navigation: "Navigasi viewer Kidung",
        music: "Opsi musik",
        reader: "Pengaturan baca",
        spacing: "Teks & jarak",
      },
      en: {
        previous: "Previous",
        next: "Next",
        navigation: "Hymn viewer navigation",
        music: "Music options",
        reader: "Reader settings",
        spacing: "Text & spacing",
      },
      zh: {
        previous: "上一首",
        next: "下一首",
        navigation: "诗歌查看器导航",
        music: "音乐选项",
        reader: "阅读设置",
        spacing: "文字与间距",
      },
    }[locale];
    const chrome = page.locator(".hymn-pdf-viewer-chrome");
    await expect(chrome).toHaveAttribute("aria-label", labels.navigation);
    await expect(chrome.locator(".pdf-music-menu > summary")).toHaveAttribute(
      "aria-label",
      labels.music,
    );
    for (const name of [labels.previous, labels.next]) {
      const button = chrome.getByRole("button", { name, exact: true });
      await expect(button).toBeVisible();
      const bounds = await button.boundingBox();
      expect(bounds!.width).toBeGreaterThanOrEqual(44);
      expect(bounds!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(page.locator(".pdf-reader-hymn")).toHaveAttribute(
      "data-direct-manipulation-ready",
      "true",
    );
    await expect(page.locator(".pdf-zoom-hud")).toHaveCount(1);
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    await chrome.locator(".viewer-chrome-button").first().click();
    await expect(page.locator(".lyrics-sheet").first()).toBeVisible();
    await expect(page.locator(".pdf-zoom-hud")).toHaveCount(0);
    await page.locator(".hymn-more-actions-summary").click();
    const settings = page.locator(".hymn-reader-settings-summary");
    await expect(settings).toHaveAttribute("aria-label", labels.reader);
    await settings.click();
    const group = page.locator(".hymn-reading-settings");
    await expect(group).toBeVisible();
    await expect(group).toHaveCSS("overflow", "visible");
    await expect(group.locator("summary")).toHaveText(labels.spacing);
  });
}

test("a PDF-only distributed song has no empty music disclosure", async ({
  page,
}) => {
  await page.route("**/offline/hymn-catalog.json", async (route) => {
    const response = await route.fetch();
    const corpus = await response.json();
    corpus.items.push({
      id: "hymne-999",
      book: "english",
      assetCode: "HYMNE",
      number: 999,
      title: "PDF-only fixture",
      verses: ["Fixture lyrics"],
      lyrics: "Fixture lyrics",
      midiPath: "assets/midi/missing-fixture.mid",
      pdfPath: "assets/data/fixture.pdf",
    });
    await route.fulfill({ json: corpus });
  });
  await page.addInitScript(() =>
    localStorage.setItem(
      "gys-hymn-view-mode-v1",
      JSON.stringify({ version: 1, modes: { "hymne-999": "pdf" } }),
    ),
  );
  await page.goto("/GYSApp-Tauri/kidung/hymne-999");
  const chrome = page.locator(".hymn-pdf-viewer-chrome.is-no-music");
  await expect(chrome).toBeVisible();
  await expect(chrome).toContainText("PDF-only fixture");
  await expect(chrome.locator(".pdf-music-menu")).toHaveCount(0);
});
