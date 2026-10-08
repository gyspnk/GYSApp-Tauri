import { expect, test } from "@playwright/test";

for (const width of [390, 1280]) {
  test(`system text size scales shell text without zooming icons (${width}px)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("/GYSApp-Tauri/kidung");
    const label = page.locator(".pujian-title").first();
    await expect(label).toBeVisible();
    const before = await label.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    const icon = page.locator(".navigation-shell svg").first();
    const iconBefore = await icon.boundingBox();
    // Browser default-font preferences affect relative CSS in the same way as
    // this root change. Android's own fontScale is handled by WebView textZoom.
    await page.evaluate(() => {
      const root = document.documentElement;
      root.style.fontSize = `${parseFloat(getComputedStyle(root).fontSize) * 1.5}px`;
    });
    await expect
      .poll(() =>
        label.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      )
      .toBeCloseTo(before * 1.5, 1);
    expect((await icon.boundingBox())?.width).toBe(iconBefore?.width);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
