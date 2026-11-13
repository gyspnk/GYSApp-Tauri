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

    // Capture the text reader's numbers while it is still on screen: the score
    // replaces the whole subtree, so these cannot be read after the click.
    const textControl = await page
      .locator(".hymn-text-toolbar .hymn-partitur-toggle")
      .evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { w: Math.round(box.width), h: Math.round(box.height) };
      });
    const textType = await title.evaluate((node) => {
      const cs = getComputedStyle(node);
      return { size: cs.fontSize, weight: cs.fontWeight };
    });
    const footer = await page.locator(".hymn-text-footer").evaluate((node) => {
      const cs = getComputedStyle(node);
      return {
        background: cs.backgroundColor,
        border: cs.borderTopColor,
        radius: cs.borderRadius,
      };
    });

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

    // Same controls, same type, same paper: the header is one component that
    // happens to sit in two viewers, so every number below has to match.
    const scoreControl = await chrome
      .locator(".hymn-pdf-text-toggle")
      .evaluate((node) => {
        const box = node.getBoundingClientRect();
        return { w: Math.round(box.width), h: Math.round(box.height) };
      });
    expect(Math.abs(scoreControl.h - textControl.h)).toBeLessThanOrEqual(1);

    const scoreType = await chromeTitle.evaluate((node) => {
      const cs = getComputedStyle(node);
      return { size: cs.fontSize, weight: cs.fontWeight };
    });
    expect(scoreType).toEqual(textType);

    // The score sheet sits on the reader's own paper, not on a tinted band.
    const paper = await page.evaluate(() => {
      const stage = document.querySelector<HTMLElement>(
        ".gys-pdf-overlay .pdf-stage",
      );
      const probe = document.createElement("div");
      probe.style.background = "var(--surface)";
      document.body.append(probe);
      const surface = getComputedStyle(probe).backgroundColor;
      probe.remove();
      return {
        surface,
        stage: stage ? getComputedStyle(stage).backgroundColor : null,
      };
    });
    expect(paper.stage).toBe(paper.surface);

    // The dock is the text footer: one floating pill, same border and radius.
    const dock = await page
      .locator(".gys-pdf-overlay .pdf-toolbar")
      .evaluate((node) => {
        const box = node.getBoundingClientRect();
        const cs = getComputedStyle(node);
        return {
          x: Math.round(box.x),
          right: Math.round(window.innerWidth - box.right),
          radius: cs.borderRadius,
          border: cs.borderTopColor,
          background: cs.backgroundColor,
        };
      });
    expect(dock.background).toBe(footer.background);
    expect(dock.border).toBe(footer.border);
    expect(dock.radius).toBe(footer.radius);
    expect(Math.abs(dock.x - dock.right)).toBeLessThanOrEqual(1);
  });
}
