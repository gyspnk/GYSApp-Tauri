import { expect, test } from "@playwright/test";

for (const width of [390, 768, 1440]) {
  test(`Kidung section controls retain their styling and animate navigation at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 720 });
    await page.addInitScript(() => {
      const start = document.startViewTransition.bind(document);
      (window as unknown as { sectionTransitions: number }).sectionTransitions =
        0;
      document.startViewTransition = ((...args: Parameters<typeof start>) => {
        (window as unknown as { sectionTransitions: number })
          .sectionTransitions++;
        return start(...args);
      }) as typeof document.startViewTransition;
    });
    await page.goto("/GYSApp-Tauri/kidung?section=playlist");
    let original: unknown;
    for (const [index, label] of [
      "Playlist",
      "Kidung",
      "Kidung",
      "Playlist",
      "Kidung",
    ].entries()) {
      const nav = page.locator(".kidung-local-nav");
      await expect(nav).toBeVisible();
      if (index)
        await nav.getByRole("link", { name: label, exact: true }).click();
      await expect(
        nav.getByRole("link", { name: label, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.classList.contains("is-reader-transition"),
          ),
        )
        .toBe(false);
      const styles = await nav
        .locator("a")
        .first()
        .evaluate((node) => {
          const css = getComputedStyle(node);
          const svg = node.querySelector("svg")!.getBoundingClientRect();
          const nav = node.closest(".kidung-local-nav")!;
          const surface = nav.closest(".kidung-controls-field") ?? nav;
          const background = getComputedStyle(surface).backgroundColor;
          return {
            background,
            height: node.getBoundingClientRect().height,
            radius: css.borderRadius,
            padding: css.padding,
            font: css.fontSize,
            icon: [svg.width, svg.height],
          };
        });
      if (!index) original = styles;
      else expect(styles).toEqual(original);
      expect(styles.height).toBeGreaterThanOrEqual(44);
      const navBox = await nav.boundingBox();
      expect(navBox!.x).toBeGreaterThanOrEqual(0);
      expect(navBox!.x + navBox!.width).toBeLessThanOrEqual(width);
      if (index < 3)
        await page.screenshot({
          path: testInfo.outputPath(`kidung-nav-${label}-${width}.png`),
          clip: { x: 0, y: 0, width, height: 440 },
        });
    }
    expect(
      await page.evaluate(
        () =>
          (window as unknown as { sectionTransitions: number })
            .sectionTransitions,
      ),
    ).toBe(3);
  });
}

test("section links retain smooth fallback motion without View Transitions", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const animate = Element.prototype.animate;
    (window as unknown as { fallbackArrivals: number }).fallbackArrivals = 0;
    Element.prototype.animate = function (...args) {
      if (this.classList.contains("route-view"))
        (window as unknown as { fallbackArrivals: number }).fallbackArrivals++;
      return animate.apply(this, args);
    };
    Object.defineProperty(document, "startViewTransition", {
      value: undefined,
      configurable: true,
    });
  });
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await page.locator('.kidung-local-nav a[aria-current="page"]').waitFor();
  await expect(page.locator("html")).toHaveClass(/has-route-transitions/);
  const before = await page.evaluate(
    () => (window as unknown as { fallbackArrivals: number }).fallbackArrivals,
  );
  await page
    .locator(".kidung-local-nav")
    .getByRole("link", { name: "Kidung", exact: true })
    .click();
  await expect(
    page.locator('.kidung-local-nav a[aria-current="page"]'),
  ).toHaveAttribute("aria-label", "Kidung");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { fallbackArrivals: number }).fallbackArrivals,
      ),
    )
    .toBeGreaterThan(before);
});

test("section navigation respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/GYSApp-Tauri/kidung?section=playlist");
  await page
    .locator(".kidung-local-nav")
    .getByRole("link", { name: "Kidung", exact: true })
    .click();
  await expect(
    page.locator('.kidung-local-nav a[aria-current="page"]'),
  ).toHaveAttribute("aria-label", "Kidung");
  expect(
    await page
      .locator(".route-view")
      .evaluate((node) => node.getAnimations().length),
  ).toBe(0);
});

test("Kidung preferences live in main settings and legacy links redirect", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".kidung-local-nav a")).toHaveCount(2);
  await expect(
    page.locator('.kidung-local-nav a[href*="settings"]'),
  ).toHaveCount(0);
  await page.goto("/GYSApp-Tauri/kidung?section=settings");
  await expect(page).toHaveURL(/\/lainnya\?section=kidung$/);
  const settings = page.locator('[data-setting="hymns"]');
  await expect(settings).toHaveAttribute("open", "");
  await expect(
    settings.getByRole("checkbox", { name: /Hindari mol\/kres/ }),
  ).toBeVisible();
  await expect(settings.locator(".kidung-settings-section")).toHaveCount(2);
  await expect(page.locator(".kidung-local-nav")).toHaveCount(0);
});
