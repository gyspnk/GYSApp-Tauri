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

    // The testament pills belong to search mode: they only mount once the
    // query reaches React state, so assert the typed value before them.
    await expect(page.locator(".bible-picker-search")).toBeVisible();
    await page.locator(".bible-picker-search").fill("Yoh");
    await expect(page.locator(".bible-picker-search")).toHaveValue("Yoh");
    await expect(page.locator(".bible-picker-testament-pills")).toBeVisible({
      timeout: 10_000,
    });
    const results = page.locator(".bible-picker-results");
    await expect(results).toBeVisible();
    const resultsBox = await results.boundingBox();
    expect(resultsBox!.x).toBeGreaterThanOrEqual(0);
    expect(resultsBox!.x + resultsBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );

    // Clearing the search restores the book list, which scrolls in place.
    await page.locator(".bible-picker-search-clear").click();
    await page.locator('[data-picker-field="book"]').click();
    const menu = page.locator(".bible-address-menu");
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox!.x).toBeGreaterThanOrEqual(0);
    expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(
      await menu
        .locator(".bible-address-options")
        .evaluate((element) => getComputedStyle(element).overflowY),
    ).toBe("auto");

    // The padded rim of the sheet is still backdrop, so an edge tap dismisses.
    await page
      .locator(".bible-picker-backdrop")
      .click({ position: { x: 1, y: 1 } });
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test("the full-screen sheet still closes from the keyboard and the rim, and returns focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
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
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "Pilih Kitab & Pasal" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();

  // The sheet covers the viewport, so the only reachable part of the backdrop
  // is the padded rim: its pointer events pass through and close the sheet.
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
});
