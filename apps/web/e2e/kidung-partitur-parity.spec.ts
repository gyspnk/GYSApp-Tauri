import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

// Owner, 12 Nov: the score is the same reader, not another app. Its chrome must
// start at the text title's gap and its buttons must keep the text toolbar's
// shape, so switching modes never moves the furniture.
for (const width of [390, 1440]) {
  test(`partitur chrome keeps the text mode rhythm at ${width}px`, async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001");
    const title = page.getByRole("heading", {
      name: /Pujilah Allah Yang Maha Esa/,
    });
    await expect(title).toBeVisible({ timeout: 15_000 });

    // The reader fades in; wait for the title to land, not for every animation
    // (skeletons loop forever and would never settle).
    const gap = width >= 720 ? 18 : 14;
    const titleTop = () =>
      title.evaluate((node) => node.getBoundingClientRect().top);
    await expect.poll(titleTop).toBeGreaterThanOrEqual(gap);
    const textTop = await titleTop();
    const textRadius = await page
      .locator(".hymn-text-toolbar .hymn-action")
      .first()
      .evaluate((node) => getComputedStyle(node).borderRadius);
    expect(textRadius).toBe("12px");

    await page.getByRole("button", { name: "Partitur", exact: true }).click();
    const chrome = page.locator(".hymn-pdf-viewer-chrome");
    await expect(chrome).toBeVisible({ timeout: 30_000 });
    // The chrome itself sticks under the topbar on wide screens, so measure the
    // title it paints: that is the gap a reader actually sees.
    const chromeTitle = page.locator(".hymn-pdf-viewer-title strong");
    await expect(chromeTitle).toBeVisible();
    const chromeTopOf = () =>
      chromeTitle.evaluate((node) => node.getBoundingClientRect().top);
    await expect.poll(chromeTopOf).toBeGreaterThanOrEqual(gap);
    const chromeTop = await chromeTopOf();
    expect(Math.abs(chromeTop - textTop)).toBeLessThanOrEqual(10);

    const chromeRadius = await page
      .locator(".hymn-pdf-viewer-chrome .viewer-chrome-button")
      .first()
      .evaluate((node) => getComputedStyle(node).borderRadius);
    expect(chromeRadius).toBe(textRadius);

    // The way back is named like the way in: no "PDF" anywhere.
    const labels = await chrome.locator("button").allTextContents();
    expect(labels.join(" ")).not.toMatch(/PDF/);
  });
}
