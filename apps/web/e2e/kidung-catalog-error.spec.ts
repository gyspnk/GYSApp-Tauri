import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("a catalogue that cannot load explains itself instead of the fetch error", async ({
  page,
}) => {
  await page.route("**/offline/hymn-catalog.json", (route) => route.abort());
  await page.route("**/offline/hymn-metadata.json", (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  const panel = page.locator(".error-panel");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("Katalog kidung belum tersedia");
  await expect(panel).toContainText("Periksa koneksi lalu coba lagi.");
  await expect(page.locator("body")).not.toContainText("Failed to fetch");
});
