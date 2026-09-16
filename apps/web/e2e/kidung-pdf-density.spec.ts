import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("single-page hymn PDF hides unavailable pager buttons", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("tab", { name: "PDF" }).click();
  const reader = page.locator(".pdf-reader-hymn");
  await expect(reader).toBeVisible({ timeout: 30_000 });
  const renderedPage = reader.locator('canvas[aria-label^="PDF page"]').first();
  await expect(renderedPage).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        renderedPage.evaluate((canvas) => {
          const pageCanvas = canvas as HTMLCanvasElement;
          return pageCanvas.width > 0 && pageCanvas.height > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(page.locator(".gys-pdf-overlay > .loading-panel")).toHaveCount(
    0,
  );

  const unavailablePager = reader.locator(
    ".pdf-page-navigation > button:disabled",
  );
  const unavailablePagerCount = await unavailablePager.count();
  expect(unavailablePagerCount).toBe(2);
  for (let index = 0; index < unavailablePagerCount; index += 1) {
    await expect(unavailablePager.nth(index)).toBeHidden();
  }
});
