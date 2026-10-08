import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

for (const width of [390, 768, 1440]) {
  test(`manual zoom retains limits and readable overflow at ${width}px`, async ({
    page,
  }) => {
    await preparePinnedReaderAssets(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page
      .getByRole("button", { name: "Tampilkan chord", exact: true })
      .click();
    await expect(page.locator(".chord-rich-line").first()).toBeVisible();
    const sheet = page.locator(".lyrics-sheet");
    const baseFontSize = () =>
      sheet.evaluate(
        (el) =>
          (parseFloat(getComputedStyle(el).fontSize) * 16) /
          parseFloat(getComputedStyle(document.documentElement).fontSize),
      );
    const zoom = async (deltaY: number) => {
      await sheet.evaluate(
        (el, deltaY) =>
          el.dispatchEvent(
            new WheelEvent("wheel", {
              ctrlKey: true,
              deltaY,
              bubbles: true,
              cancelable: true,
            }),
          ),
        deltaY,
      );
    };
    await zoom(-10000);
    await expect.poll(baseFontSize).toBe(56);
    await page.waitForTimeout(400);
    await zoom(-10000);
    await page.waitForTimeout(400);
    expect(await baseFontSize()).toBe(56);
    const collisions = await sheet.evaluate((el) => {
      const lyrics = [...el.querySelectorAll("[data-chord-char-index]")]
        .filter((char) => char.textContent?.trim())
        .map((char) => char.getBoundingClientRect());
      return [...el.querySelectorAll(".chord-visual-marker")].filter(
        (marker) => {
          const r = marker.getBoundingClientRect();
          return lyrics.some(
            (t) =>
              Math.min(r.right, t.right) - Math.max(r.left, t.left) > 2 &&
              Math.min(r.bottom, t.bottom) - Math.max(r.top, t.top) > 2,
          );
        },
      ).length;
    });
    expect(collisions).toBe(0);
    const overflow = await sheet.evaluate((el) => ({
      width: el.scrollWidth - el.clientWidth,
      page: document.documentElement.scrollWidth - innerWidth,
    }));
    expect(overflow.width).toBeLessThanOrEqual(2);
    expect(overflow.page).toBeLessThanOrEqual(2);
    await page.reload();
    await expect.poll(baseFontSize).toBe(56);
    await zoom(10000);
    await expect.poll(baseFontSize).toBe(16);
    await page.waitForTimeout(400);
    await zoom(10000);
    await page.waitForTimeout(400);
    expect(await baseFontSize()).toBe(16);
  });
}
