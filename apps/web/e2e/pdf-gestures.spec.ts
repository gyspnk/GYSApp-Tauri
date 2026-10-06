import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

for (const width of [320, 390, 768, 1440]) {
  test(`score fits and centers both axes, animates wheel/pinch and keeps native pan at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
    const canvas = page
      .locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]')
      .first();
    const stage = page.locator(".pdf-stage");
    await expect(canvas).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() =>
        stage.evaluate((element) => {
          const paper = element
            .querySelector(".pdf-page-frame > canvas")!
            .getBoundingClientRect();
          const box = element.getBoundingClientRect(),
            style = getComputedStyle(element);
          const availableWidth =
            element.clientWidth -
            parseFloat(style.paddingLeft) -
            parseFloat(style.paddingRight);
          const availableHeight =
            element.clientHeight -
            parseFloat(style.paddingTop) -
            parseFloat(style.paddingBottom);
          return Math.max(
            Math.abs(
              paper.x + paper.width / 2 - box.x - element.clientWidth / 2,
            ),
            Math.abs(
              paper.y + paper.height / 2 - box.y - element.clientHeight / 2,
            ),
            Math.min(
              Math.abs(paper.width - availableWidth),
              Math.abs(paper.height - availableHeight),
            ),
          );
        }),
      )
      .toBeLessThanOrEqual(1);
    const initial = (await canvas.boundingBox())!;
    const animation = await stage.evaluate(
      (element) =>
        new Promise<{ prevented: boolean; widths: number[] }>((resolve) => {
          const paper = element.querySelector(".pdf-page-frame > canvas")!;
          const box = paper.getBoundingClientRect();
          const prevented = !element.dispatchEvent(
            new WheelEvent("wheel", {
              deltaY: -300,
              ctrlKey: true,
              clientX: box.x + box.width / 2,
              clientY: box.y + box.height / 2,
              bubbles: true,
              cancelable: true,
            }),
          );
          const widths: number[] = [],
            start = performance.now();
          const sample = () => {
            widths.push(paper.getBoundingClientRect().width);
            if (performance.now() - start < 260) requestAnimationFrame(sample);
            else resolve({ prevented, widths });
          };
          requestAnimationFrame(sample);
        }),
    );
    expect(animation.prevented).toBe(true);
    expect(
      animation.widths.some(
        (value) => value > initial.width * 1.05 && value < initial.width * 1.7,
      ),
    ).toBe(true);
    for (let index = 1; index < animation.widths.length; index++)
      expect(
        Math.abs(animation.widths[index]! - animation.widths[index - 1]!),
      ).toBeLessThan(initial.width * 0.25);
    await expect(page.locator(".pdf-zoom-indicator")).toHaveText("182%");
    await expect
      .poll(async () => (await canvas.boundingBox())!.width / initial.width)
      .toBeCloseTo(1.82, 2);
    const enlarged = (await canvas.boundingBox())!;
    expect(
      Math.abs(
        enlarged.y + enlarged.height / 2 - initial.y - initial.height / 2,
      ),
    ).toBeLessThan(3);
    await page.mouse.move(width / 2, 400);
    await page.mouse.wheel(0, 160);
    await expect(page.locator(".pdf-zoom-indicator")).toHaveText("182%");
    await expect
      .poll(() => stage.evaluate((element) => element.scrollTop))
      .toBeGreaterThan(0);
    await stage.focus();
    await page.keyboard.press("Control+0");
    await expect(page.locator(".pdf-zoom-indicator")).toHaveText("100%");
    await expect
      .poll(async () => (await canvas.boundingBox())!.width / initial.width)
      .toBeCloseTo(1, 2);
    const consumed = await stage.evaluate((element) => {
      const box = element.getBoundingClientRect(),
        y = box.y + box.height / 2;
      const touches = (distance: number) =>
        [-1, 1].map(
          (side, identifier) =>
            new Touch({
              identifier,
              target: element,
              clientX: box.x + box.width / 2 + (side * distance) / 2,
              clientY: y,
            }),
        );
      const start = !element.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: touches(100),
          bubbles: true,
          cancelable: true,
        }),
      );
      const move = !element.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: touches(200),
          bubbles: true,
          cancelable: true,
        }),
      );
      element.dispatchEvent(
        new TouchEvent("touchend", { touches: [], bubbles: true }),
      );
      return { start, move };
    });
    expect(consumed).toEqual({ start: true, move: true });
    await expect(page.locator(".pdf-zoom-indicator")).toHaveText("200%");
    await expect
      .poll(async () => (await canvas.boundingBox())!.width / initial.width)
      .toBeCloseTo(2, 2);
    expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("800% zoom paints screen-density vector tiles instead of stretching a low-resolution bitmap", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
  await expect(
    page.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.locator(".pdf-stage").evaluate((element) =>
    element.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -1500,
        ctrlKey: true,
        clientX: 700,
        clientY: 450,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await expect(page.locator(".pdf-zoom-indicator")).toHaveText("800%");
  const tiles = page.locator("canvas[data-pdf-detail]");
  await expect(tiles.first()).toBeVisible();
  const densities = await tiles.evaluateAll((elements) =>
    elements.map((element) => {
      const canvas = element as HTMLCanvasElement;
      return {
        density: canvas.width / parseFloat(canvas.style.width),
        pixels: canvas.width * canvas.height,
      };
    }),
  );
  expect(densities.length).toBeLessThanOrEqual(12);
  for (const tile of densities) {
    expect(tile.density).toBeGreaterThanOrEqual(2);
    expect(tile.pixels).toBeLessThanOrEqual(4_000_000);
  }
  const darkSamples = await tiles.evaluateAll((elements) =>
    elements.reduce((count, element) => {
      const canvas = element as HTMLCanvasElement,
        pixels = canvas
          .getContext("2d")!
          .getImageData(0, 0, canvas.width, canvas.height).data;
      for (let offset = 0; offset < pixels.length; offset += 64)
        if (pixels[offset]! < 160 && pixels[offset + 3]! > 0) count++;
      return count;
    }, 0),
  );
  expect(darkSamples).toBeGreaterThan(10);
  await page.locator(".pdf-stage").focus();
  await page.keyboard.press("Control+0");
  await expect(tiles).toHaveCount(0);
  expect(failures).toEqual([]);
  await context.close();
});

test("native touchscreen pinch and Ctrl wheel stay inside the reader on a 3x display", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 760 },
    hasTouch: true,
    isMobile: true,
    deviceScaleFactor: 3,
    serviceWorkers: "block",
  });
  const page = await context.newPage();
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
  await expect(
    page.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  await page.mouse.move(195, 380);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -150);
  await page.keyboard.up("Control");
  await expect
    .poll(async () =>
      parseInt((await page.locator(".pdf-zoom-indicator").textContent())!, 10),
    )
    .toBeGreaterThan(100);
  await page.locator(".pdf-stage").focus();
  await page.keyboard.press("Control+0");
  await expect(page.locator(".pdf-zoom-indicator")).toHaveText("100%");
  const cdp = await context.newCDPSession(page);
  const points = (distance: number) => [
    { id: 0, x: 195 - distance / 2, y: 380 },
    { id: 1, x: 195 + distance / 2, y: 380 },
  ];
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: points(100),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: points(160),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: points(200),
  });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect(page.locator(".pdf-zoom-indicator")).toHaveText("200%");
  expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
  const tiles = page.locator("canvas[data-pdf-detail]");
  await expect(tiles.first()).toBeVisible();
  for (const density of await tiles.evaluateAll((elements) =>
    elements.map(
      (element) =>
        (element as HTMLCanvasElement).width /
        parseFloat((element as HTMLElement).style.width),
    ),
  ))
    expect(density).toBeGreaterThanOrEqual(3);
  await page.locator(".hymn-pdf-text-toggle").click();
  await expect(tiles).toHaveCount(0);
  await context.close();
});

test("reduced motion applies PDF zoom immediately and respects both bounds", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
  await expect(
    page.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  const ratios = await page.locator(".pdf-stage").evaluate((element) => {
    const canvas = element.querySelector(".pdf-page-frame > canvas")!,
      initial = canvas.getBoundingClientRect().width;
    element.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -10000,
        bubbles: true,
        cancelable: true,
      }),
    );
    const enlarged = canvas.getBoundingClientRect().width / initial;
    element.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: 10000,
        bubbles: true,
        cancelable: true,
      }),
    );
    return { enlarged, reset: canvas.getBoundingClientRect().width / initial };
  });
  expect(ratios.enlarged).toBeCloseTo(8, 2);
  expect(ratios.reset).toBeCloseTo(1, 2);
});

test("a one-page hymn stays centered when the reader preference requests a spread", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 760 });
  await page.addInitScript(() =>
    localStorage.setItem(
      "gys-hymn-viewer-prefs-v1",
      JSON.stringify({ defaultTwoPage: true }),
    ),
  );
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
  await expect(
    page.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "single",
  );
  await expect(page.locator('canvas[data-pdf-rendered="true"]')).toHaveCount(1);
  const box = (await page
    .locator('canvas[data-pdf-rendered="true"]')
    .boundingBox())!;
  expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(1);
});
