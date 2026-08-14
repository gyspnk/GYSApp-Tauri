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
