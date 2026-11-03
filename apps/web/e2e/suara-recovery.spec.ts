import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("an unknown testimony id gets the recovery card", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/suara/tidak-ada");
  const card = page.locator(".route-recovery");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Kesaksian tidak ditemukan" }),
  ).toBeVisible();
  await expect(card).toContainText("Tautan ini tidak ada di koleksi");
  await card.getByRole("link", { name: "Kembali ke kesaksian" }).click();
  await expect(page).toHaveURL(/\/GYSApp-Tauri\/suara$/);
  await expect(page.locator(".suara-library-item").first()).toBeVisible({
    timeout: 15_000,
  });
});
