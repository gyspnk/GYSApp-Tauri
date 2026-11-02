import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("literature offers a retry after the catalogue fails", async ({
  page,
}) => {
  await page.route("**/offline/literature.json", (route) => route.abort());
  await page.goto("/GYSApp-Tauri/literatur");
  const panel = page.locator(".error-panel");
  await expect(panel).toContainText("Katalog literatur belum tersedia");
  await expect(panel).toContainText("Periksa koneksi lalu coba lagi.");

  await page.unroute("**/offline/literature.json");
  await panel.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.locator(".literature-row").first()).toBeVisible({
    timeout: 15_000,
  });
});

test("faith offers a retry after the pack fails", async ({ page }) => {
  await page.route("**/offline/faith.json", (route) => route.abort());
  await page.goto("/GYSApp-Tauri/iman");
  const panel = page.locator(".error-panel");
  await expect(panel).toContainText("Pokok iman belum tersedia");
  await expect(panel).toContainText("Periksa koneksi lalu coba lagi.");

  await page.unroute("**/offline/faith.json");
  await panel.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.locator(".faith-row-heading").first()).toBeVisible({
    timeout: 15_000,
  });
});
