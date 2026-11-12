import { expect, test } from "@playwright/test";

// Chromium reports a color-mix() result either as rgba(...) or as
// color(srgb r g b / alpha); both need the same alpha read.
function alphaOf(value: string): number {
  const slash = value.match(/\/\s*([0-9.]+)\s*\)/);
  if (slash) return Number(slash[1]);
  const rgba = value.match(/rgba?\(([^)]+)\)/);
  if (!rgba) return 1;
  const parts = rgba[1].split(",").map((part) => part.trim());
  return parts.length === 4 ? Number(parts[3]) : 1;
}

// Dragging the book name is the one surface that takes the whole screen: the
// readout floats above, the columns sheet fills what is left, and the page
// stays visible through the blurred sheet instead of a dark scrim.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 390, height: 844 },
]) {
  test(`dragging the book name fills the screen at ${viewport.width}x${viewport.height}`, async ({
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
    await page.waitForSelector(".picker-book-title", { timeout: 30_000 });

    const handle = page.locator(".quick-nav-handle");
    const handleBox = await handle.boundingBox();
    if (!handleBox)
      throw new Error("Bible quick navigation handle is not measurable");
    const centreX = handleBox.x + handleBox.width / 2;
    const centreY = handleBox.y + handleBox.height / 2;
    await page.mouse.move(centreX, centreY);
    await page.mouse.down();
    await page.mouse.move(centreX + 2, centreY, { steps: 2 });
    await page.mouse.move(centreX + 8, centreY, { steps: 3 });

    // The readout is announced but not painted: the sheet itself is the screen.
    await expect(page.locator(".quick-nav-floater")).toHaveCount(0);
    await expect(page.locator(".quick-nav-column-header")).toHaveCount(0);
    const sheet = page.locator(".quick-nav-columns-container");
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    expect(box).not.toBeNull();
    expect(Math.abs(box!.width - viewport.width)).toBeLessThanOrEqual(2);
    expect(box!.height).toBeGreaterThanOrEqual(viewport.height - 4);
    await expect(sheet).toHaveCSS("border-radius", "0px");
    // WCAG 2.2 target size (minimum) is 24x24; the sheet is one continuous drag
    // surface, so every cell has to stay at least that tall to be hittable.
    const cell = await page.locator(".quick-nav-item").first().boundingBox();
    expect(cell).not.toBeNull();
    expect(cell!.height).toBeGreaterThanOrEqual(24);
    expect(cell!.width).toBeGreaterThanOrEqual(24);

    // The veil is a blur, not a solid scrim: the page behind stays visible
    // through the backdrop filter while the sheet itself paints nothing.
    const surface = await page
      .locator(".quick-nav-drag-overlay")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          filter: [style.backdropFilter, style.webkitBackdropFilter]
            .filter((value) => value && value !== "none")
            .join(" "),
          background: style.backgroundColor,
          sheetBackground: getComputedStyle(
            element.querySelector(".quick-nav-columns-container") as Element,
          ).backgroundColor,
        };
      });
    expect(surface.filter).toContain("blur");
    expect(alphaOf(surface.background)).toBeLessThan(0.08);
    expect(alphaOf(surface.sheetBackground)).toBeLessThan(0.08);

    await page.mouse.up();
    await expect(page.locator(".quick-nav-drag-overlay")).toBeHidden();
  });
}
