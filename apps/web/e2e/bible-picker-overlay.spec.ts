import { expect, test } from "@playwright/test";

// The address picker stays a centred card; the full-screen surface belongs to
// the drag quick navigation (bible-quick-nav-overlay.spec.ts).
for (const viewport of [
  { width: 844, height: 390 },
  { width: 1024, height: 600 },
]) {
  test(`the address picker stays a centred card at ${viewport.width}x${viewport.height}`, async ({
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
    expect(box!.width).toBeLessThanOrEqual(422);
    expect(box!.width).toBeLessThanOrEqual(viewport.width - 20);
    expect(
      Math.abs(box!.x + box!.width / 2 - viewport.width / 2),
    ).toBeLessThanOrEqual(2);
    await expect(panel).toHaveCSS("border-radius", "24px");

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
    const alpha = Number(
      backdropStyle.background
        .match(/rgba?\(([^)]+)\)/)?.[1]
        .split(",")
        .map((part) => part.trim())[3],
    );
    expect(alpha).toBeGreaterThan(0);

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

    // A card leaves real backdrop around it, so an edge tap dismisses.
    await page
      .locator(".bible-picker-backdrop")
      .click({ position: { x: 2, y: 2 } });
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });
}

test("the card still closes from the keyboard and the rim, and returns focus", async ({
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

  // The card is centred, so the backdrop around it is reachable.
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.mouse.click(2, 2);
  await expect(dialog).toBeHidden();
});
