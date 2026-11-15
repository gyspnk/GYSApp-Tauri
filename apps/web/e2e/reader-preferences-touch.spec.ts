import { expect, test } from "@playwright/test";

/** The text-settings panel is where a reader changes type size and line
 *  spacing, and its A-/A+ pair measured 42x40 — under the shell's hit floor,
 *  in a panel opened on a phone. */
test.describe("reader preferences touch targets", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("every text control meets the hit floor", async ({ page }) => {
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
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    await expect(page.locator(".hymn-text-title h1")).toBeVisible({
      timeout: 30_000,
    });
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    ).toBe(true);

    // The reader re-renders once the hymn's typography settles, and a
    // re-render closes a disclosure opened too early, so open it after the
    // toolbar has stopped moving.
    await expect(page.locator(".hymn-text-toolbar")).toBeVisible();
    await page.waitForTimeout(1_200);
    // The text controls live in a nested disclosure inside the reader
    // settings, so both have to be open before anything is measurable.
    // The text controls sit three disclosures deep (more actions → reader
    // settings → reading group), so every one of them has to be open before
    // anything inside is measurable.
    await page.evaluate(() => {
      for (const panel of document.querySelectorAll(
        ".hymn-text-toolbar details",
      )) {
        if (panel instanceof HTMLDetailsElement) panel.open = true;
      }
    });
    const preferences = page.locator(".reader-preferences");
    await expect(preferences).toBeVisible();

    const boxes = await preferences.locator("button").evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { width: box.width, height: box.height };
      }),
    );
    // Four size/spacing buttons plus the icon-only reset.
    expect(boxes.length).toBeGreaterThanOrEqual(5);
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
