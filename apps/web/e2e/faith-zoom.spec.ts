import { expect, test } from "@playwright/test";

// Real bundled Faith content; keep unrelated network requests out of these UI contracts.
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\//, (route) => route.abort());
});

test("Faith Ctrl+wheel zooms text in/out while ordinary scrolling stays native", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/iman");
  const text = page.locator(".faith-statement").first();
  await expect(text).toBeVisible();
  const size = () =>
    text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
  const initial = await size();
  const row = page.locator(".faith-row").first();
  const bounds = await row.boundingBox();
  await text.hover();
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -200);
  await expect.poll(size).toBeGreaterThan(initial);
  await page.mouse.wheel(0, 200);
  await expect.poll(size).toBeCloseTo(initial, 1);
  await page.keyboard.up("Control");
  const native = await text.evaluate((el) => {
    const event = new WheelEvent("wheel", {
      deltaY: 60,
      bubbles: true,
      cancelable: true,
    });
    el.dispatchEvent(event);
    return !event.defaultPrevented;
  });
  expect(native).toBe(true);
  await expect.poll(size).toBeCloseTo(initial, 1);
  // The row grows with the text it contains, so only its width stays fixed.
  expect((await row.boundingBox())!.width).toBeCloseTo(bounds!.width, 1);
  await text.evaluate((el) =>
    el.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -100000,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect.poll(size).toBeCloseTo(initial * 3, 1);
  await text.evaluate((el) =>
    el.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: 100000,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect.poll(size).toBeCloseTo(initial * 0.75, 1);
});

test.describe("Faith phone touch zoom", () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  test("pinch scales system-sized text without zooming the shell", async ({
    page,
    context,
  }) => {
    await page.goto("/GYSApp-Tauri/iman");
    const text = page.locator(".faith-statement").first();
    await expect(text).toBeVisible();
    const size = () =>
      text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const initial = await size();
    const touch = await context.newCDPSession(page);
    const points = (spread: number) => [
      { x: 190 - spread / 2, y: 230, id: 1 },
      { x: 190 + spread / 2, y: 230, id: 2 },
    ];
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(100),
    });
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(200),
    });
    await expect.poll(size).toBeCloseTo(initial * 2, 1);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(50),
    });
    await expect.poll(size).toBeCloseTo(initial * 0.75, 1);
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
    ).toBe(false);
    await page.reload();
    await expect.poll(size).toBeCloseTo(initial, 1);
  });
});

for (const width of [320, 1440]) {
  for (const locale of ["id", "en", "zh"] as const) {
    test(`Faith compact layout and search (${locale}, ${width}px)`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript(
        (locale) =>
          localStorage.setItem(
            "gys-shell-settings-v1",
            JSON.stringify({ version: 1, locale, theme: "light" }),
          ),
        locale,
      );
      await page.goto("/GYSApp-Tauri/iman");
      const paragraphs = page.locator(".faith-statement");
      await expect(paragraphs).toHaveCount(10);
      // Phones read ragged-right on purpose: narrow justified columns open
      // rivers between words. See the reading typography note in the plan.
      await expect(paragraphs.first()).toHaveCSS(
        "text-align",
        width <= 767 ? "start" : "justify",
      );
      const baseFontSize = (element: HTMLElement | SVGElement) =>
        (parseFloat(getComputedStyle(element).fontSize) * 16) /
        parseFloat(getComputedStyle(document.documentElement).fontSize);
      // The creed keeps reading size on phones; it is not compacted to 14 px.
      await expect
        .poll(() => paragraphs.first().evaluate(baseFontSize))
        .toBeCloseTo(width < 600 ? 18 : 20, 1);
      await expect(page.locator(".faith-hint, .connection-status")).toHaveCount(
        0,
      );
      // The page now shows its title like Literatur/Suara; it used to be
      // screen-reader-only, which left the route without a visible identity.
      const heading = page.locator(".faith-page h1");
      await expect(heading).toBeVisible();
      await expect(heading).toHaveCSS("white-space", "normal");
      const bounds = await page.locator(".faith-page").boundingBox();
      const searchBox = await page
        .locator(".faith-search-bar")
        .first()
        .boundingBox();
      const rowBox = await page.locator(".faith-row").first().boundingBox();
      // The rows and the search field share one edge: the page on a phone, the
      // reader's 88ch measure on a desktop (faith-measure.spec.ts owns the cap).
      expect(searchBox!.width).toBeCloseTo(rowBox!.width, 1);
      expect(rowBox!.width).toBeLessThanOrEqual(bounds!.width + 0.5);
      if (width > 767) expect(rowBox!.width).toBeLessThan(bounds!.width - 1);
      // One tap per row: the row itself is the button and the PDF lives in
      // the sheet it opens.
      const row = page.locator(".faith-row").first();
      await expect(row).toHaveAttribute("aria-haspopup", "dialog");
      await expect(row).toHaveAttribute("aria-expanded", "false");
      expect((await row.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      await expect(page.getByRole("button", { name: /Buka PDF/ })).toHaveCount(
        0,
      );
      const input = page.getByLabel(
        {
          id: "Cari pokok iman",
          en: "Search faith topics",
          zh: "搜索信仰要点",
        }[locale],
        { exact: true },
      );
      await expect(input).toHaveCount(1);
      // The field is the same control as the two reading catalogs' search
      // field, so its type size is theirs (0.875rem, 15.75 px on a phone);
      // page-titles.spec.ts owns the cross-route equality. Here only the floor
      // matters: the input must never shrink below the readable size.
      await expect
        .poll(async () => parseFloat(await input.evaluate(baseFontSize)))
        .toBeGreaterThanOrEqual(14);
      await input.fill("2");
      await expect(paragraphs).toHaveCount(1);
      await expect(page.locator(".faith-number")).toHaveText("02");
      await page.locator(".faith-search-clear").click();
      await expect(paragraphs).toHaveCount(10);
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        ),
      ).toBe(false);
    });
  }
}
