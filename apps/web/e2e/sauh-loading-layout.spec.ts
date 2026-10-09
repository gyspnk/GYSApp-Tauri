import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) {
  for (const scale of [1, 1.5]) {
    test(`Compact Sauh loading fits its complete label at ${width}px and ${scale}x`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((fontScale) => {
        document.addEventListener(
          "DOMContentLoaded",
          () =>
            (document.documentElement.style.fontSize = `${16 * fontScale}px`),
          { once: true },
        );
      }, scale);
      await page.route("**/offline/sauh.json", (route) =>
        route.fulfill({ json: { items: [] } }),
      );
      await page.route("**/api/v1/content/sauh", () => {});
      await page.route(/wp-json\/wp\/v2\/posts/, () => {});
      await page.goto("/GYSApp-Tauri/");
      const skeleton = page.getByTestId("home-sauh-skeleton");
      await expect(skeleton).toBeVisible();
      await expect(skeleton.locator("img")).toHaveCount(0);
      await expect(skeleton.locator(".loading-progress-label")).toHaveText(
        "Memuat Sauh Bagi Jiwa…",
      );
      const bounds = await skeleton.evaluate((node) => {
        const panel = node.closest(".verse-panel")!.getBoundingClientRect();
        const label = node
          .querySelector(".loading-progress-label")!
          .getBoundingClientRect();
        const track = node
          .querySelector(".loading-progress-track")!
          .getBoundingClientRect();
        const heading = node
          .closest(".verse-panel")!
          .querySelector(".section-heading")!
          .getBoundingClientRect();
        return {
          gap: track.top - heading.bottom,
          items: [label, track].map((rect) => ({
            left: rect.left - panel.left,
            right: panel.right - rect.right,
            top: rect.top - panel.top,
            bottom: panel.bottom - rect.bottom,
          })),
        };
      });
      expect(bounds.gap).toBeGreaterThanOrEqual(0);
      for (const item of bounds.items)
        for (const distance of Object.values(item))
          expect(distance).toBeGreaterThanOrEqual(0);
      if (scale === 1 && width !== 320)
        await page.screenshot({
          path: testInfo.outputPath(`sauh-loading-${width}.png`),
          clip: { x: 0, y: 0, width, height: 680 },
        });
    });
  }
}
