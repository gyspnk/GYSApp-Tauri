import { expect, test } from "@playwright/test";

for (const [width, collapsed] of [
  [390, false],
  [768, false],
  [1440, false],
  [1440, true],
] as const) {
  test(`home navigation stays visible after scrolling at ${width}px, collapsed=${collapsed}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/");
    await expect(page.locator(".home-grid")).toBeVisible();
    if (collapsed) await page.locator(".sidebar-collapse-toggle").click();
    await page.evaluate(() =>
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "instant",
      }),
    );
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
    const nav = page.locator(".navigation-shell");
    const box = (await nav.boundingBox())!;
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.y + box.height).toBeLessThanOrEqual(801);
    await expect(nav.getByRole("link", { name: /Beranda/ })).toBeInViewport();
    await expect(nav.getByRole("link", { name: /Lainnya/ })).toBeInViewport();
    if (width >= 600) {
      const header = (await page.locator(".topbar").boundingBox())!;
      expect(Math.abs(box.y - (header.y + header.height))).toBeLessThan(1);
    }
  });
}
