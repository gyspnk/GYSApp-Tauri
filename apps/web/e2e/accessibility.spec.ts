import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
  "base64",
);

async function prepareReadingAudit(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({ body: transparentPixel, contentType: "image/png" });
      return;
    }
    await route.abort();
  });
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-15T00:00:00.000Z",
        items: [
          {
            id: "axe-literature",
            category: "kesaksian",
            title: "Kesaksian Dalam Penyertaan Tuhan",
            description: "Bacaan pembinaan keluarga.",
            url: "https://tjc.org/id/kesaksian/axe-literature/",
            format: "article",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
          {
            id: "axe-pdf",
            category: "panduan",
            title: "Panduan PDF Audit",
            description: "PDF pembinaan untuk menguji pembaca internal.",
            url: "https://tjc.org/id/panduan/axe-pdf.pdf",
            format: "pdf",
            publishedAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/offline/faith.json", (route) =>
    route.fulfill({
      json: {
        faith: [
          {
            language: "ID",
            title: "Dasar Kepercayaan",
            content: [
              {
                number: "1",
                text: "Percaya bahwa Yesus Kristus adalah Firman yang menjadi manusia.",
              },
            ],
          },
        ],
      },
    }),
  );
}

async function expectNoAxeViolations(page: Page) {
  const results = await new AxeBuilder({ page }).analyze();
  expect(
    results.violations,
    JSON.stringify(results.violations, null, 2),
  ).toEqual([]);
}

test.describe("Quiet Sanctuary accessibility release gate", () => {
  test("home has no axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("root recovery stays localized and focuses reload", async ({ page }) => {
    const copies = [
      {
        locale: "id",
        title: "Ruang ini perlu dimuat ulang",
        body: "Konten lokal tetap aman. Muat ulang untuk memulihkan tampilan.",
        reload: "Muat ulang",
      },
      {
        locale: "en",
        title: "This space needs to be reloaded",
        body: "Your local content is safe. Reload to restore the app.",
        reload: "Reload",
      },
      {
        locale: "zh",
        title: "此空间需要重新加载",
        body: "本地内容仍然安全。请重新加载以恢复应用。",
        reload: "重新加载",
      },
    ] as const;

    await page.addInitScript(() => {
      const locale = new URLSearchParams(window.location.search).get(
        "__gys_locale",
      );
      if (locale) {
        localStorage.setItem(
          "gys-shell-settings-v1",
          JSON.stringify({ version: 1, locale, theme: "light" }),
        );
        localStorage.setItem("gys-locale", locale);
      }
    });

    for (const copy of copies) {
      await page.goto(
        `/GYSApp-Tauri/?__gys_shell_error=1&__gys_locale=${copy.locale}`,
      );

      const recovery = page.getByTestId("app-error-boundary");
      await expect(recovery).toBeVisible();
      await expect(
        recovery.getByRole("heading", { name: copy.title, exact: true }),
      ).toBeVisible();
      await expect(recovery.getByText(copy.body, { exact: true })).toBeVisible();
      const reload = recovery.getByRole("button", {
        name: copy.reload,
        exact: true,
      });
      await expect(reload).toBeFocused();
      await expect(reload).toHaveCSS("min-height", "44px");
      await expectNoAxeViolations(page);
    }
  });

  test("dark theme home has no axe violations", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.addInitScript(() => localStorage.setItem("gys-theme", "dark"));
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("heading", { name: "Selamat datang kembali" }),
    ).toBeVisible();

    await expectNoAxeViolations(page);
  });

  test("Bible keeps a visible focus target through keyboard navigation", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      {
        timeout: 15_000,
      },
    );

    await page.keyboard.press("Tab");
    const focused = page.locator(":focus");
    await expect(focused).toBeVisible();
    await expect(focused).toHaveCSS("outline-style", /solid|auto/);
  });

  test("Bible fixed chrome keeps localized accessible names", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/bible");
    await expect(page.getByRole("heading", { name: /Kejadian 1/ })).toBeVisible(
      { timeout: 15_000 },
    );

    await page.getByRole("button", { name: "Menu Alkitab" }).click();
    await page.getByRole("button", { name: "Bahasa", exact: true }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();

    await expect(
      page.getByRole("dialog", { name: "Reading menu" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close menu", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Split view Compare two chapters / translations",
      }),
    ).toBeVisible();
    await expect(page.getByText("Menu Bacaan", { exact: true })).toHaveCount(0);

    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "中文", exact: true }).click();
    await expect(
      page.getByRole("dialog", { name: "阅读菜单" }),
    ).toBeVisible();
    await expect(page.getByText("Menu Bacaan", { exact: true })).toHaveCount(0);
    await expect(page.getByText("阅读菜单", { exact: true })).toBeVisible();
  });

  test("Kidung mobile has no axe violations", async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/kidung");
    await expect(
      page.getByRole("heading", { name: "Kidung", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await expectNoAxeViolations(page);
  });

  test("Kidung settings keeps localized controls and accessible names", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/kidung?section=settings");
    await expect(
      page.getByRole("heading", { name: "Pengaturan", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    const settings = page.locator(".kidung-settings-layout");
    await expect(
      settings.getByRole("button", { name: "Bahasa", exact: true }),
    ).toBeVisible();
    await expect(
      settings.getByRole("button", { name: "Tema", exact: true }),
    ).toBeVisible();

    await settings.getByRole("button", { name: "Bahasa", exact: true }).click();
    await settings.getByRole("option", { name: "English", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Language and theme", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "MIDI player", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "Chord letter theme", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("slider", { name: /Chord background opacity/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: "Clear cache & reset preferences",
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText("Pemutar MIDI", { exact: true })).toHaveCount(0);

    await settings.getByRole("button", { name: "Language", exact: true }).click();
    await settings.getByRole("option", { name: "Chinese", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "设置", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "语言与主题", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("group", { name: "和弦字母主题", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("slider", { name: /和弦背景不透明度/ }),
    ).toBeVisible();
    await expect(page.getByText("Pemutar MIDI", { exact: true })).toHaveCount(0);
  });

  test("report form exposes an accessible message field", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/lainnya?section=help");
    await expect(
      page.getByRole("heading", { name: "Lainnya", exact: true }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByRole("textbox", { name: "Pesan laporan" }),
    ).toBeVisible();
  });

  test("global search trigger keeps localized visible and accessible copy", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/iman");
    await expect(page.locator(".faith-page")).toBeVisible({ timeout: 15_000 });

    await expect(
      page.getByRole("button", { name: "Cari di seluruh aplikasi" }),
    ).toBeVisible();
    await expect(page.locator(".search-trigger > span")).toHaveText("Cari");
    await page.getByRole("button", { name: "Bahasa", exact: true }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Search across the app" }),
    ).toBeVisible();
    await expect(page.locator(".search-trigger > span")).toHaveText("Search");

    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "中文", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "搜索整个应用" }),
    ).toBeVisible();
    await expect(page.locator(".search-trigger > span")).toHaveText("搜索");
  });

  test("global search traps focus, announces states, and restores the trigger", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });

    for (const [width, height] of [
      [320, 720],
      [390, 844],
      [768, 1024],
      [1440, 900],
    ]) {
      await page.setViewportSize({ width, height });
      await page.goto("/GYSApp-Tauri/");
      const trigger = page.getByRole("button", {
        name: "Cari di seluruh aplikasi",
      });
      await trigger.click();

      const dialog = page.getByRole("dialog", { name: "Temukan sesuatu" });
      const input = dialog.getByRole("textbox", {
        name: "Cari Alkitab, Kidung, Literatur, Iman, atau media",
      });
      const close = dialog.getByRole("button", { name: "Tutup", exact: true });
      await expect(input).toBeFocused();
      await expect(dialog.getByRole("status")).toBeVisible();

      const geometry = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
      }));
      expect(geometry.documentWidth).toBeLessThanOrEqual(
        geometry.viewportWidth,
      );

      await page.keyboard.press("Tab");
      await expect(close).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(input).toBeFocused();

      if (width === 320) {
        await input.fill("Pujilah");
        const results = dialog.getByRole("list", { name: "Hasil pencarian" });
        await expect(results).toBeVisible({ timeout: 15_000 });
        await expect(dialog.getByRole("status")).toContainText(
          "hasil ditemukan",
        );
        await expect(results.getByRole("button").first()).toBeVisible();
      }

      await page.keyboard.press("Escape");
      await expect(trigger).toBeFocused();
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/");
    const idTrigger = page.getByRole("button", {
      name: "Cari di seluruh aplikasi",
    });
    await page.getByRole("button", { name: "Bahasa", exact: true }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    const enTrigger = page.getByRole("button", {
      name: "Search across the app",
    });
    await enTrigger.click();
    const enDialog = page.getByRole("dialog", { name: "Find something" });
    await expect(
      enDialog.getByRole("textbox", {
        name: "Search the Bible, hymns, literature, faith, or media",
      }),
    ).toBeFocused();
    await expect(enDialog.getByRole("status")).toContainText("Search");
    await enDialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(enTrigger).toBeFocused();

    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "中文", exact: true }).click();
    const zhTrigger = page.getByRole("button", { name: "搜索整个应用" });
    await zhTrigger.click();
    const zhDialog = page.getByRole("dialog", { name: "查找内容" });
    await expect(
      zhDialog.getByRole("textbox", {
        name: "搜索圣经、诗歌、文献、信仰或媒体",
      }),
    ).toBeFocused();
    await expect(zhDialog.getByRole("status")).toContainText("搜索");
    await zhDialog.getByRole("button", { name: "关闭", exact: true }).click();
    await expect(zhTrigger).toBeFocused();
    await expect(idTrigger).toHaveCount(0);
  });

  test("Faith fixed chrome keeps localized mobile dialogs and PDF states", async ({
    page,
  }) => {
    await prepareReadingAudit(page);
    await page.route("**/api/v1/content/pdf**", (route) =>
      route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "official PDF not found",
      }),
    );
    await page.route("**/Yesus-Kristus.pdf**", (route) =>
      route.fulfill({
        status: 404,
        contentType: "text/plain",
        body: "official PDF not found",
      }),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/iman");
    await expect(page.locator(".faith-page")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Bahasa", exact: true }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Open faith topic 1 PDF" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Open note for faith topic 1" }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Open note for faith topic 1" })
      .click();
    await expect(page.getByRole("dialog", { name: "Topic 1" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Close faith topic" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Read more ↗" })).toBeVisible();

    await page.getByRole("button", { name: "Personal note" }).click();
    await expect(
      page.getByRole("dialog", { name: "Faith topic notes" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Close notes" })).toBeVisible();
    await page.getByRole("button", { name: "Close notes" }).click();
    await page.getByRole("button", { name: "Read more ↗" }).click();
    await expect(page.getByRole("alert")).toContainText("HTTP 404", {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("link", { name: "Open official source page ↗" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Close reading" }).click();

    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "中文", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "打开信仰要点 1 PDF" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "打开信仰要点 1笔记" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "打开信仰要点 1笔记" })
      .click();
    await expect(page.getByRole("dialog", { name: "要点 1" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: "关闭信仰要点" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "关闭信仰要点" }).click();
  });

  test("Literature catalog fixed chrome keeps localized controls", async ({
    page,
  }) => {
    await prepareReadingAudit(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/literatur");
    await expect(
      page.getByRole("heading", { name: "Literatur", exact: true }),
    ).toBeVisible({ timeout: 15_000 });

    await page.getByRole("button", { name: "Bahasa", exact: true }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Literature", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Search literature" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Category", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Sort", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Category", exact: true }).click();
    await expect(
      page.getByRole("listbox", { name: "Category" }),
    ).toBeVisible();
    await expect(
      page.getByRole("option", { name: "All collections", exact: true }),
    ).toBeVisible();
    await page.getByRole("option", { name: /Testimonies/ }).click();
    await page.getByRole("button", { name: "Sort", exact: true }).click();
    await expect(
      page.getByRole("option", { name: "Newest", exact: true }),
    ).toBeVisible();
    await page.getByRole("option", { name: "Newest", exact: true }).click();
    await expect(page.getByRole("link", { name: /Open reading/ })).toBeVisible();

    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "中文", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "文献", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "搜索文献" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "分类", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "排序", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /打开阅读/ })).toBeVisible();
  });

  test("Literature detail keeps localized reader and unavailable states", async ({
    page,
  }) => {
    await prepareReadingAudit(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/literatur/axe-literature");
    await expect(page.getByTestId("literature-detail")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      page.getByRole("link", { name: "← Semua literatur", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Bahasa", exact: true }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "← All literature", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Read in app", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Official source ↗", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "☆ Save to favorites", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start reading" })).toBeVisible();
    await expect(
      page.getByText("Manage progress & offline", { exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Read in app", exact: true }).click();
    await expect(
      page.getByText("This reading could not be loaded in the app.", {
        exact: true,
      }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(/official source or its connector is unreachable/i),
    ).toBeVisible();
    await expect(page.getByText(/Worker article/i)).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Language", exact: true }).click();
    await page.getByRole("option", { name: "中文", exact: true }).click();
    await expect(
      page.getByRole("link", { name: "← 全部文献", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText("无法在应用中加载此读物。", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "重试", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "语言", exact: true }).click();
    await page.getByRole("option", { name: "EN", exact: true }).click();
    await page.route("**/api/v1/content/pdf**", (route) =>
      route.fulfill({ status: 503, body: "literature PDF unavailable" }),
    );
    await page.goto("/GYSApp-Tauri/literatur/axe-pdf?read=1");
    await expect(page.getByRole("alert")).toContainText("PDF failed to load", {
      timeout: 15_000,
    });
    await expect(
      page.getByRole("button", { name: "Try again", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Official PDF ↗", exact: true }),
    ).toBeVisible();
  });

  test("tablet navigation keeps accessible names when copy is collapsed", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 720, height: 900 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/GYSApp-Tauri/");
    await expect(
      page.getByRole("link", { name: "Beranda", exact: true }),
    ).toBeVisible();
  });

  test("Literatur, Iman, and preferences have no axe violations", async ({
    page,
  }) => {
    await prepareReadingAudit(page);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/GYSApp-Tauri/literatur");
    await expect(page.locator(".literature-page")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/GYSApp-Tauri/iman");
    await expect(page.locator(".faith-page")).toBeVisible();
    await expectNoAxeViolations(page);

    await page.goto("/GYSApp-Tauri/lainnya");
    await page.getByRole("button", { name: "Tampilan & keterbacaan" }).click();
    await expect(
      page.getByRole("dialog", { name: "Tampilan & keterbacaan" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });
});
