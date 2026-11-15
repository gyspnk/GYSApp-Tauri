import { expect, test } from "@playwright/test";

/** Every control in the settings panels is a thumb target. The chord palette
 *  was 26 px and the playlist link was a 17 px text line, both under the
 *  shell's 44 px floor, in the two panels a reader opens to change how the
 *  reader itself behaves. */
test.describe("settings touch targets", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("the hymn panel keeps every control at the hit floor", async ({
    page,
  }) => {
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
    await page.goto("/GYSApp-Tauri/lainnya");
    await expect(page.locator(".more-settings-list")).toBeVisible();
    // The contract must not silently measure a fine pointer.
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);

    await page.evaluate(() => {
      const row = document.querySelector('[data-setting="hymns"]');
      if (row instanceof HTMLDetailsElement) row.open = true;
    });
    const panel = page.locator('[data-setting="hymns"]');
    await expect(panel.locator(".chord-ui-swatch").first()).toBeVisible();

    const boxes = await panel
      .locator(".chord-ui-swatch, .kidung-settings-section > .text-button")
      .evaluateAll((nodes) =>
        nodes.map((node) => {
          const box = node.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }),
      );
    expect(boxes.length).toBeGreaterThan(3);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(43.5);
      expect(box.width).toBeGreaterThanOrEqual(43.5);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  });
});
