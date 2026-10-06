import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`faith PDF renders locally with compact controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/iman");
    await page
      .locator('.faith-pdf-open, button[aria-label*="PDF"]')
      .first()
      .click();
    const dialog = page.locator(".faith-pdf-overlay");
    await expect(dialog).toBeVisible();
    const canvas = dialog.locator(".pdf-pages canvas").first();
    await expect
      .poll(() => canvas.evaluate((el: HTMLCanvasElement) => el.width))
      .toBeGreaterThan(100);
    await expect(dialog.locator(".pdf-loading")).toBeHidden();
    await expect(dialog.locator(".pdf-error-state")).toHaveCount(0);
    const head = await dialog.locator(".faith-pdf-head").boundingBox();
    const toolbar = await dialog.locator(".pdf-toolbar").boundingBox();
    const stage = await dialog.locator(".pdf-stage").boundingBox();
    expect(head!.height).toBeLessThanOrEqual(64);
    expect(toolbar!.y).toBeGreaterThan(stage!.y);
    expect(toolbar!.height).toBeLessThanOrEqual(76);
    await expect(dialog.locator(".pdf-advanced-controls")).toBeHidden();
    await dialog.locator(".pdf-advanced-toggle").click();
    await expect(dialog.locator(".pdf-advanced-controls")).toBeVisible();
    await dialog.locator(".pdf-advanced-toggle").click();
    await dialog.locator(".pdf-page-navigation > button").last().click();
    await expect(dialog.locator(".pdf-page-jump input")).toHaveValue("2");
    await dialog.locator(".faith-pdf-close").click();
    await expect(dialog).toBeHidden();
  });
}

test("all ten official doctrine PDFs render without external requests", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/iman");
  const buttons = page.locator('button[aria-label*="PDF"]');
  await expect(buttons).toHaveCount(10);
  for (let index = 0; index < 10; index++) {
    await buttons.nth(index).click();
    const dialog = page.locator(".faith-pdf-overlay");
    await expect(dialog.locator(".pdf-page-jump input")).toBeVisible();
    await expect(dialog.locator(".pdf-loading")).toBeHidden();
    await expect(dialog.locator(".pdf-error-state")).toHaveCount(0);
    expect(
      await dialog
        .locator(".pdf-pages canvas")
        .first()
        .evaluate(
          (el: HTMLCanvasElement) =>
            el.getContext("2d")!.getImageData(el.width / 2, el.height / 2, 1, 1)
              .data[3],
        ),
    ).toBe(255);
    await dialog.locator(".faith-pdf-close").click();
    await expect(dialog).toBeHidden();
  }
});
