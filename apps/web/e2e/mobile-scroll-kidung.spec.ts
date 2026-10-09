import { expect, test } from "@playwright/test";

for (const width of [320, 390, 430, 600, 601, 768, 820, 1024, 1100]) {
  test(`responsive Kidung field fills its controls without overlap (${width})`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung");
    const field = page.locator(".kidung-controls-field");
    await expect(field.locator(".control-select-trigger")).toBeVisible();
    const inspect = () =>
      field.evaluate((e) => {
        const container = e.getBoundingClientRect();
        const links = [...e.querySelectorAll(".kidung-local-nav a")].map((x) =>
          x.getBoundingClientRect(),
        );
        const nav = e
          .querySelector(".kidung-local-nav")!
          .getBoundingClientRect();
        const category = e
          .querySelector(".control-select-trigger")!
          .getBoundingClientRect();
        const mode = e
          .querySelector(".kidung-mode-cycle")!
          .getBoundingClientRect();
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          unused: container.right - mode.right,
          links: links.map((r) => ({ width: r.width, height: r.height })),
          navGap: nav.right - links.at(-1)!.right,
          overlap:
            links.at(-1)!.right > category.left + 0.5 ||
            category.right > mode.left + 0.5,
        };
      });
    for (const scale of [1, 1.5]) {
      if (scale > 1)
        await page.evaluate(
          () =>
            (document.documentElement.style.fontSize = `${parseFloat(getComputedStyle(document.documentElement).fontSize) * 1.5}px`),
        );
      await expect.poll(async () => (await inspect()).overflow).toBe(false);
      const geometry = await inspect();
      expect(geometry.overlap).toBe(false);
      expect(geometry.unused).toBeLessThanOrEqual(6);
      expect(geometry.navGap).toBeLessThanOrEqual(1);
      for (const link of geometry.links) {
        expect(link.width).toBeGreaterThanOrEqual(43.5);
        expect(link.height).toBeGreaterThanOrEqual(43.5);
      }
    }
    await page.locator(".add-to-playlist-btn").first().click();
    await expect(field.locator(".kidung-local-nav small")).toHaveText("1");
    const geometry = await inspect();
    expect(geometry.overlap).toBe(false);
    await field.getByRole("combobox").click();
    await page.getByRole("option", { name: "KR", exact: true }).click();
    await expect(field.getByRole("combobox")).toContainText("KR");
    expect((await inspect()).overlap).toBe(false);
  });
}

test("page boundaries remain anchored while scrolling at either end", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/kidung");
  await expect(page.locator(".pujian-item").first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  for (const boundary of ["top", "bottom"]) {
    await page.evaluate(async (b) => {
      window.scrollTo({
        top: b === "top" ? 0 : document.documentElement.scrollHeight,
        behavior: "instant",
      });
      // Virtualized rows acquire their measured height on entering the viewport.
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        ),
      );
      window.scrollTo({
        top: b === "top" ? 0 : document.documentElement.scrollHeight,
        behavior: "instant",
      });
    }, boundary);
    const start = await page.evaluate(() => scrollY);
    await page.mouse.wheel(0, boundary === "top" ? -3000 : 3000);
    await expect.poll(() => page.evaluate(() => scrollY)).toBe(start);
  }
  expect(
    await page.evaluate(() =>
      [document.documentElement, document.body].map(
        (e) => getComputedStyle(e).overscrollBehaviorY,
      ),
    ),
  ).toEqual(["none", "none"]);
});
