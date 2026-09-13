import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

async function openHymnPdf(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah Yang Maha Esa/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("button", { name: "Buka PDF" }).click();
  await expect(page.locator(".pdf-reader-hymn")).toBeVisible({
    timeout: 30_000,
  });
}

test("Kidung PDF keeps zoom direct-manipulation first", async ({ page }) => {
  await openHymnPdf(page);

  // Primary reading chrome stays focused on the document itself: zoom and
  // layout configuration belong to direct manipulation / the options surface.
  await expect(
    page.locator('.pdf-reader-hymn input[type="range"]'),
  ).toBeHidden();
  await expect(
    page.locator(".pdf-reader-hymn .pdf-view-scroll-toggle"),
  ).toBeHidden();

  // Technical controls begin collapsed, but remain available as an explicit
  // single-pointer/accessibility fallback when requested.
  const advanced = page.locator(".pdf-reader-hymn .pdf-advanced-controls");
  await expect(advanced).toBeHidden();
  const options = page.getByRole("button", { name: "Opsi PDF" });
  await expect(options).toBeVisible();
  await options.click();
  await expect(advanced).toBeVisible();
  await expect(
    page.locator(".pdf-reader-hymn .pdf-layout-toggle"),
  ).toBeVisible();
  await expect(
    advanced.getByRole("button", { name: "Perbesar PDF" }),
  ).toBeVisible();
  await options.click();
  await expect(advanced).toBeHidden();

  // Desktop keyboard mirrors pinch / Ctrl+wheel and gives transient feedback.
  const stage = page.locator(".pdf-reader-hymn .pdf-stage");
  await stage.focus();
  await page.keyboard.press("Control+=");
  const zoomHud = page.getByRole("status", { name: "Zoom PDF" });
  await expect(zoomHud).toContainText("125%");
  await expect(stage).toHaveClass(/is-zoomed/);

  await page.keyboard.press("Control+0");
  await expect(zoomHud).toContainText("100%");
  await expect(stage).toHaveClass(/is-fit/);
});
