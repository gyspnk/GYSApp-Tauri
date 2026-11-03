import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("an unknown literature id gets the recovery card", async ({ page }) => {
  await page.goto("/GYSApp-Tauri/literatur/tidak-ada");
  const card = page.locator(".route-recovery");
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("heading", { name: "Literatur tidak ditemukan" }),
  ).toBeVisible();
  await expect(card).toContainText("Judul ini tidak ada di katalog literatur");
  await card.getByRole("link", { name: "Kembali ke katalog" }).click();
  await expect(page).toHaveURL(/\/GYSApp-Tauri\/literatur$/);
  await expect(page.getByRole("heading", { name: "Literatur" })).toBeVisible({
    timeout: 15_000,
  });
});
