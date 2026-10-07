import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

// Regression guard for the narrowest supported phone layout.
test("320px Kidung local navigation keeps icon targets reachable and labels accessible", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/GYSApp-Tauri/kidung");
  await page.locator(".kidung-local-nav").waitFor({ state: "visible" });

  const links = page.locator(".kidung-local-nav a");
  await expect(links).toHaveCount(3);

  for (let index = 0; index < (await links.count()); index += 1) {
    const link = links.nth(index);
    await expect(link).toHaveAccessibleName(/\S/);
    const icon = link.locator("svg");
    await expect(icon).toBeVisible();
    const bounds = (await link.boundingBox())!;
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
    const glyph = (await icon.boundingBox())!;
    expect(glyph.x).toBeGreaterThanOrEqual(bounds.x);
    expect(glyph.x + glyph.width).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  }
});
