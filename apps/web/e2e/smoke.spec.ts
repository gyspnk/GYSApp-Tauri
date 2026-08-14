import { expect, test } from "@playwright/test";

test("shell navigation and locale switch are usable", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator("nav.primary-nav")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "Selamat datang kembali" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bahasa" }).click();
  await page.getByRole("option", { name: "EN" }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Hymns/ }).first().click();
  await expect(page).toHaveURL(/\/kidung$/);
  await expect(
    page.getByRole("heading", { name: "Hymns", exact: true }).first(),
  ).toBeVisible();
});

test("responsive shell keeps one navigation and no horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator("nav.primary-nav")).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    )
    .toBe(true);
  await expect(page.getByRole("link", { name: "Beranda" })).toBeVisible();
});

test("offline reader packs open without a network request", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(
    page.getByRole("heading", { name: "Alkitab", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("link", { name: /Iman/ }).first().click();
  await expect(
    page.getByRole("heading", { name: "Iman", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Dasar Kepercayaan" }),
  ).toBeVisible();
});

test("Bible reader keeps search, split reading, and verse annotations local", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/bible");
  await expect(page.getByRole("heading", { name: /Yohanes 3/ })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByLabel("Cari Alkitab").fill("begitu besar");
  await page.getByLabel("Frasa tepat").check();
  await page.getByRole("button", { name: "Cari", exact: true }).click();
  await expect(page.locator(".result-item").first()).toBeVisible();
  await page.getByRole("button", { name: "Dua kolom" }).click();
  await expect(page.locator(".bible-pane")).toHaveCount(2);
  await page
    .getByRole("button", { name: /Karena begitu besar kasih Allah/ })
    .first()
    .click();
  await expect(page.getByLabel("Catatan pribadi")).toBeVisible();
  await page
    .getByLabel("Catatan pribadi")
    .fill("Kasih Tuhan menjadi dasar pengharapan.");
  await page.getByRole("button", { name: "Simpan catatan" }).click();
  await page.getByRole("button", { name: "Sorot blue" }).click();
  await expect(page.locator(".verse-row.is-highlight-blue")).toHaveCount(1);
});

test("home surfaces today's Sauh and canonical Suara Sejati feed", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await expect(page.getByRole("heading", { name: "Suara Sejati" })).toBeVisible(
    { timeout: 15_000 },
  );
  await expect(page.locator(".sauh-image")).toHaveCount(1);
});

test("literature behaves as a searchable ebook shelf and hymn opens by detail route", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  await expect(
    page.getByRole("heading", { name: "Literatur", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".literature-shelf-item").first()).toBeVisible({
    timeout: 15_000,
  });
  await page
    .getByRole("link", { name: /Kidung/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/kidung$/);
  await page
    .getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ })
    .click();
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
  await expect(page.getByRole("tab", { name: "1" })).toBeVisible();
});

test("home keeps one continue item when Bible and hymn history coexist", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-activity-v1",
      JSON.stringify({
        version: 1,
        bible: {
          book: "Yohanes",
          chapter: 3,
          updatedAt: "2026-08-14T01:00:00.000Z",
        },
        hymn: {
          id: "hymn-001",
          title: "Pujilah Allah Yang Maha Esa",
          number: 1,
          verseIndex: 0,
          updatedAt: "2026-08-14T02:00:00.000Z",
        },
      }),
    );
  });
  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".continue-item")).toHaveCount(1);
});

test("global search indexes real offline content and navigates to a result", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/");
  await page.getByRole("button", { name: /Cari di seluruh aplikasi/ }).click();
  await expect(
    page.getByRole("dialog", { name: "Temukan sesuatu" }),
  ).toBeVisible();
  await page
    .getByLabel("Cari Kidung, Literatur, Iman, atau media")
    .fill("Pujilah Allah Yang Maha Esa");
  await expect(
    page.getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ }).first(),
  ).toBeVisible({ timeout: 15_000 });
  await page
    .getByRole("button", { name: /Pujilah Allah Yang Maha Esa/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/kidung\/hymn-001$/);
});

test("literature detail persists favorite and progress controls", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/literatur");
  await page.locator(".literature-row").first().click();
  await expect(page.locator('[data-testid="literature-detail"]')).toBeVisible();
  await page.getByRole("button", { name: /Simpan favorit/ }).click();
  await expect(page.getByRole("button", { name: /Favorit/ })).toBeVisible();
  await page.getByRole("button", { name: "Tandai dibuka" }).click();
  await expect(page.locator("progress")).toHaveAttribute("value", "1");
  await page.goto("/GYSApp-Tauri/literatur");
  await expect(
    page.getByRole("heading", { name: "Terakhir dilihat" }),
  ).toBeVisible();
  await expect(page.locator(".literature-recent-item")).toHaveCount(1);
});
