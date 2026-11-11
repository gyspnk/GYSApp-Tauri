import { expect, test } from "@playwright/test";

// The quick navigation sheet is the page: full viewport, square corners, a
// transparent blurred backdrop instead of a tinted card scrim.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 1024, height: 600 },
]) {
  test(`quick navigation fills the screen with a blurred backdrop at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.addInitScript(() => {
      localStorage.setItem("gys-bible-book", "43");
      localStorage.setItem("gys-bible-chapter", "12");
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale: "id", theme: "light" }),
      );
    });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/bible");

    const trigger = page.locator(".reader-context-book-picker");
    await expect(trigger).toBeVisible();
    await trigger.click();

    const dialog = page.getByRole("dialog", { name: "Pilih Kitab & Pasal" });
    await expect(dialog).toBeVisible();
    const panel = page.locator(".bible-address-picker");
    const box = await panel.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width - viewport.width)).toBeLessThanOrEqual(2);
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height * 0.9 - 2);
    await expect(panel).toHaveCSS("border-radius", "0px");

    const backdropStyle = await page
      .locator(".bible-picker-backdrop")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          filter: [style.backdropFilter, style.webkitBackdropFilter]
            .filter((value) => value && value !== "none")
            .join(" "),
          background: style.backgroundColor,
        };
      });
    expect(backdropStyle.filter).toContain("blur");
    const alpha = backdropStyle.background
      .match(/rgba?\(([^)]+)\)/)?.[1]
      .split(",")
      .map((part) => part.trim())[3];
    expect(alpha === undefined || Number(alpha) === 0).toBe(true);

    // The controls stay readable inside the sheet.
    await expect(page.locator(".bible-picker-search")).toBeVisible();
    await expect(page.locator(".bible-picker-testament-pills")).toBeVisible();
    await expect(page.locator('[data-picker-field="book"]')).toBeVisible();

    // The padded rim of the sheet is still backdrop, so an edge tap dismisses.
    await page
      .locator(".bible-picker-backdrop")
      .click({ position: { x: 1, y: 1 } });
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}
