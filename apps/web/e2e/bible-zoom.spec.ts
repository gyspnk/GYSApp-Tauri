import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`Bible zoom stays smooth and bounded without changing controls at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/bible");
    const text = page.locator(".verse-text").first();
    await expect(text).toBeVisible();
    const content = await page.locator(".verse-row").allTextContents();
    const initial = await text.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    const control = page.locator(".primary-nav .nav-item").first();
    const controlSize = await control.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    const sizes = await text.evaluate(
      (el) =>
        new Promise<number[]>((resolve) => {
          const sizes: number[] = [];
          el.dispatchEvent(
            new WheelEvent("wheel", {
              ctrlKey: true,
              deltaY: -200,
              bubbles: true,
              cancelable: true,
            }),
          );
          const start = performance.now();
          const sample = () => {
            sizes.push(parseFloat(getComputedStyle(el).fontSize));
            if (performance.now() - start < 650) requestAnimationFrame(sample);
            else resolve(sizes);
          };
          requestAnimationFrame(sample);
        }),
    );
    expect(new Set(sizes.map((size) => size.toFixed(2))).size).toBeGreaterThan(
      3,
    );
    expect(sizes.at(-1)).toBeGreaterThan(initial);
    for (const [delta, scale] of [
      [-100000, 3],
      [100000, 0.75],
    ] as const) {
      await text.evaluate(
        (el, delta) =>
          el.dispatchEvent(
            new WheelEvent("wheel", {
              ctrlKey: true,
              deltaY: delta,
              bubbles: true,
              cancelable: true,
            }),
          ),
        delta,
      );
      await expect
        .poll(() =>
          text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
        )
        .toBeCloseTo(initial * scale, 1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    expect(await page.locator(".verse-row").allTextContents()).toEqual(content);
    expect(
      await control.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
    ).toBe(controlSize);
    const ordinaryScroll = await text.evaluate((el) => {
      const event = new WheelEvent("wheel", {
        deltaY: 80,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      return !event.defaultPrevented;
    });
    expect(ordinaryScroll).toBe(true);
  });
}
