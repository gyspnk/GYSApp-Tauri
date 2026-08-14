import { expect, test } from "@playwright/test";

test("shell navigation and locale switch are usable", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/");
  await expect(
    page.getByRole("heading", { name: "Selamat datang kembali" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Bahasa" }).selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Welcome back" }),
  ).toBeVisible();
  await page.getByRole("link", { name: /Hymns/ }).first().click();
  await expect(page).toHaveURL(/\/kidung$/);
  await expect(
    page.getByRole("heading", { name: "Hymns", exact: true }).first(),
  ).toBeVisible();
});
