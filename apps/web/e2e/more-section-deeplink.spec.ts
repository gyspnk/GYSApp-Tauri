import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("More shows compact setting categories and hides details until requested", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/lainnya");

  const rows = page.locator(".more-setting-section");
  await expect(rows).toHaveCount(7);
  await expect(rows.locator(":scope > summary")).toHaveText([
    "Akun",
    "Tampilan",
    "Audio & Suara",
    "Kidung",
    "Data Offline",
    "Backup",
    "Tentang & Bantuan",
  ]);
  for (let index = 0; index < 7; index += 1) {
    await expect(rows.nth(index).locator(":scope > summary")).toBeInViewport();
  }
  await expect(page.locator(".more-setting-section[open]")).toHaveCount(0);
  await expect(page.locator(".account-card")).toBeHidden();
  await expect(page.getByRole("button", { name: "Pilih Tema" })).toBeHidden();
  await expect(page.locator(".distributed-assets-list")).toBeHidden();

  await rows.nth(0).locator(":scope > summary").click();
  await expect(page.locator(".account-card")).toBeVisible();
  await rows.nth(0).locator(":scope > summary").click();
  await rows.nth(1).locator(":scope > summary").click();
  await expect(page.getByRole("button", { name: "Pilih Tema" })).toBeVisible();
  await expect(page.locator(".theme-pill-grid")).toHaveCount(0);
  await expect(page.locator(".accent-palette-grid")).toBeHidden();
});

test("appearance choices are contextual and preserve theme, accent, and language", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/lainnya");
  await page.locator('[data-setting="appearance"] > summary').click();

  const themePicker = page.getByRole("button", {
    name: "Pilih Tema",
    exact: true,
  });
  const themeMenu = page.getByRole("listbox", {
    name: "Pilih Tema",
    exact: true,
  });
  await expect(themeMenu).toHaveCount(0);
  await themePicker.click();
  await expect(themeMenu.getByRole("option")).toHaveCount(5);
  await themeMenu.getByRole("option", { name: "Gelap", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  const accent = page.locator('[data-setting="accent"]');
  const palette = accent.locator(".accent-palette-grid");
  await expect(palette).toBeHidden();
  await accent.locator(":scope > summary").click();
  const emerald = palette.getByRole("radio", {
    name: "Warna aksen Zamrud",
    exact: true,
  });
  await emerald.click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--blue")
          .trim(),
      ),
    )
    .toBe("#059669");

  await page.getByRole("button", { name: "Pilih Bahasa", exact: true }).click();
  await page
    .getByRole("listbox", { name: "Pilih Bahasa", exact: true })
    .getByRole("option", { name: /English$/ })
    .click();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(accent.locator(".appearance-setting-name")).toHaveText(
    "Accent color",
  );
  await expect(accent.locator(".appearance-setting-value")).toHaveText(
    "Emerald",
  );

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect
    .poll(() =>
      page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--blue")
          .trim(),
      ),
    )
    .toBe("#059669");
});

test("More setting categories are localized in Indonesian, English, and Chinese", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });
  const categories = {
    id: [
      "Akun",
      "Tampilan",
      "Audio & Suara",
      "Kidung",
      "Data Offline",
      "Backup",
      "Tentang & Bantuan",
    ],
    en: [
      "Account",
      "Appearance",
      "Audio & voice",
      "Hymns",
      "Offline data",
      "Backup",
      "About & help",
    ],
    zh: [
      "账户",
      "外观",
      "音频与语音",
      "圣诗",
      "离线数据",
      "备份",
      "关于与帮助",
    ],
  } as const;
  const appearanceLabels = {
    id: ["Tema Layar", "Warna Aksen", "Bahasa Aplikasi"],
    en: ["Screen theme", "Accent color", "App language"],
    zh: ["屏幕主题", "强调色", "应用语言"],
  } as const;

  for (const locale of ["id", "en", "zh"] as const) {
    await page.goto(`/GYSApp-Tauri/lainnya?__gys_locale=${locale}`);
    await expect(page.locator(".more-setting-section > summary")).toHaveText(
      categories[locale],
    );
    await page.locator('[data-setting="appearance"] > summary').click();
    await expect(
      page.locator(".appearance-settings .appearance-setting-name"),
    ).toHaveText(appearanceLabels[locale]);
    await expect(page.locator(".accent-palette-grid")).toBeHidden();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
  }
});

test("More data deep link remains visible after asynchronous layout settles", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/lainnya?section=data");

  await expect(page.locator(".distributed-assets-list")).toBeVisible();
  await expect(page.locator(".account-loading-box")).toHaveCount(0, {
    timeout: 10_000,
  });
  await expect(page.getByText("Memuat katalog aset…")).toHaveCount(0, {
    timeout: 10_000,
  });

  const category = page.locator(
    '.more-setting-section[data-setting="offline"] > .more-setting-row',
  );
  await expect(category).toBeVisible();
  await expect
    .poll(async () => (await category.boundingBox())?.y ?? -1)
    .toBeGreaterThanOrEqual(64);
  await expect
    .poll(
      async () => (await category.boundingBox())?.y ?? Number.MAX_SAFE_INTEGER,
    )
    .toBeLessThan(100);
});

test("More audio settings link opens the existing Bible voice controls", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/lainnya");
  const audio = page.locator('[data-setting="audio"]');
  await audio.locator("summary").click();
  await audio.getByRole("link", { name: "Pengaturan Suara" }).click();

  await expect(page.locator(".reader-hamburger-drawer")).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.locator(".reader-hamburger-drawer .speech-settings-toggle"),
  ).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByLabel("Mesin")).toBeVisible();
});
