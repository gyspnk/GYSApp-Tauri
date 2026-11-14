import { expect, test } from "@playwright/test";

// Eyebrows above a heading are the smallest text in the shell. They used to be
// 0.625rem, which rendered 10 px at 1440 — below the 12 px floor the rest of the
// app keeps for micro text, and below the size at which the uppercase tracking
// still reads as a label rather than a smudge.
// The Bible's translation label sits inside a screen-reader-only heading, so it
// is not painted and has no size to hold to a floor.
const ROUTES = ["/", "/literatur"];

for (const width of [390, 1440]) {
  test(`eyebrows keep the micro-text floor at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({
          version: 1,
          locale: "id",
          theme: "light",
          onboarded: true,
        }),
      );
    });
    await page.route(/^https:\/\//, (route) => route.abort());

    for (const route of ROUTES) {
      await page.goto(`/GYSApp-Tauri${route}`);
      const lines = page.locator(".date-line");
      await expect(lines.first()).toBeVisible();
      const sizes = await lines.evaluateAll((nodes) =>
        nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)),
      );
      expect(sizes.length).toBeGreaterThan(0);
      for (const size of sizes) expect(size).toBeGreaterThanOrEqual(12);
    }
  });
}
