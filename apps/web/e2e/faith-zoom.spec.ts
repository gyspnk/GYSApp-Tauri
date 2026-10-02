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
  const button = page.locator(".faith-row-summary").first();
  const bounds = await button.boundingBox();
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
  expect((await button.boundingBox())!.height).toBeCloseTo(bounds!.height, 1);
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
  test("pinch enlarges/shrinks 14px text without zooming the shell", async ({
    page,
    context,
  }) => {
    await page.goto("/GYSApp-Tauri/iman");
    const text = page.locator(".faith-statement").first();
    await expect(text).toHaveCSS("font-size", "14px");
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
    await expect(text).toHaveCSS("font-size", "28px");
    await touch.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(50),
    });
    await expect(text).toHaveCSS("font-size", "10.5px");
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
    await expect(text).toHaveCSS("font-size", "14px");
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
      await expect(paragraphs.first()).toHaveCSS("text-align", "justify");
      await expect(paragraphs.first()).toHaveCSS(
        "font-size",
        width < 600 ? "14px" : "20px",
      );
      await expect(page.locator(".faith-hint, .connection-status")).toHaveCount(
        0,
      );
      await expect(page.locator(".faith-page h1")).toHaveClass("sr-only");
      const bounds = await page.locator(".faith-page").boundingBox();
      for (const selector of [".faith-search-bar", ".faith-row"]) {
        const box = await page.locator(selector).first().boundingBox();
        expect(box!.width).toBeCloseTo(bounds!.width, 1);
      }
      const actions = page.locator(".faith-row-actions").first();
      const tools = await actions.getByRole("button").all();
      for (const tool of tools)
        expect((await tool.boundingBox())!.height).toBeCloseTo(32, 1);
      const paragraph = (await paragraphs.first().boundingBox())!;
      const lastTool = (await tools.at(-1)!.boundingBox())!;
      expect(lastTool.x + lastTool.width).toBeCloseTo(
        paragraph.x + paragraph.width,
        1,
      );
      expect(lastTool.y - paragraph.y - paragraph.height).toBeCloseTo(8, 1);
      const input = page.getByLabel(
        {
          id: "Cari pokok iman",
          en: "Search faith topics",
          zh: "搜索信仰要点",
        }[locale],
        { exact: true },
      );
      await expect(input).toHaveCount(1);
      await expect(input).toHaveCSS(
        "font-size",
        width >= 960 ? "16px" : "14px",
      );
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
