import { expect, test } from "@playwright/test";

// Landscape phones and small tablets are where the reader used to cap the text
// at 64ch and leave a third of the page empty.
for (const viewport of [
  { width: 844, height: 390 },
  { width: 1024, height: 600 },
]) {
  test(`Bible text fills the page column at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/bible");
    const content = page.locator(".verse-content").first();
    await expect(content).toBeVisible();

    const metrics = await content.evaluate((element) => {
      const list = element.closest(".verse-list") as HTMLElement;
      const listStyle = getComputedStyle(list);
      const column =
        list.clientWidth -
        parseFloat(listStyle.paddingLeft) -
        parseFloat(listStyle.paddingRight);
      return {
        width: element.getBoundingClientRect().width,
        column,
        fontSize: parseFloat(getComputedStyle(element).fontSize),
      };
    });

    expect(metrics.column).toBeGreaterThan(0);
    expect(metrics.width / metrics.column).toBeGreaterThanOrEqual(0.7);
    expect(metrics.fontSize).toBeGreaterThanOrEqual(20);

    const documentWidth = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(documentWidth.scroll).toBeLessThanOrEqual(documentWidth.client);
  });
}
