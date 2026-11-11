import { expect, test } from "@playwright/test";

test("Escape closes only the top faith layer", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/GYSApp-Tauri/iman");

  const row = page.locator(".faith-row").first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  const sheet = page.locator(".faith-modal-backdrop");
  await expect(sheet).toBeVisible();
  await expect(row).toHaveAttribute("aria-expanded", "true");

  const readMore = sheet.getByRole("button", { name: /Baca lebih lanjut/ });
  await readMore.click();

  const pdf = page.locator(".faith-pdf-backdrop");
  await expect(pdf).toBeVisible();
  await expect(pdf.locator(".faith-pdf-close")).toBeFocused();
  await expect(sheet).toBeVisible();

  await page.keyboard.press("Tab");
  expect(
    await pdf.evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(pdf).toHaveCount(0);
  await expect(sheet).toBeVisible();
  await expect(readMore).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await expect(row).toBeFocused();
});
