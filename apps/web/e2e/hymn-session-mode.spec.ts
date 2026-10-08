import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

test("Kidung starts with text, keeps mode during navigation, resets after reload", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "gys-hymn-view-mode-v1",
      JSON.stringify({ version: 1, modes: { "hymn-001": "pdf" } }),
    ),
  );
  await page.goto("/GYSApp-Tauri/kidung");
  const mode = page.locator(".kidung-mode-cycle");
  await expect(mode).toHaveAttribute("aria-pressed", "false");
  await mode.click();
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await page.locator(".pujian-title").first().click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await expect(page).not.toHaveURL(/mode=/);
  await page.goBack();
  await expect(mode).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(mode).toHaveAttribute("aria-pressed", "false");
  await page.locator(".pujian-title").first().click();
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await page.locator(".hymn-partitur-toggle").click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await page.reload();
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
});
