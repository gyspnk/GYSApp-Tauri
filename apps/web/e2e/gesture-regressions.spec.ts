import { expect, test } from "@playwright/test";

test.use({ viewport: { width: 768, height: 1024 }, hasTouch: true });

for (const fullscreen of [false, true]) {
  test(`lyrics pinch updates once per frame without persisting during gesture (${fullscreen ? "fullscreen" : "reader"})`, async ({
    page,
    context,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    if (fullscreen) {
      await page.locator(".hymn-more-actions > summary").click();
      await page.locator(".hymn-fullscreen-action").click();
    }
    const text = page.locator(
      fullscreen ? ".lyrics-verse-text" : ".lyrics-sheet",
    );
    await expect(text).toBeVisible();
    // Measure actual font writes and preference writes, not only final geometry.
    await page.evaluate(() => {
      const original = Storage.prototype.setItem;
      (window as any).__fontWrites = 0;
      Storage.prototype.setItem = function (key, value) {
        if (/typography|lyrics-font-size/.test(key))
          (window as any).__fontWrites++;
        return original.call(this, key, value);
      };
    });
    const box = (await text.boundingBox())!;
    const x = box.x + box.width / 2,
      y = box.y + Math.min(80, box.height / 2);
    const cdp = await context.newCDPSession(page);
    const points = (spread: number) => [
      { x: x - spread / 2, y, id: 1 },
      { x: x + spread / 2, y, id: 2 },
    ];
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(100),
    });
    await expect(text).toHaveClass(/is-pinching/);
    expect(
      await text.evaluate((el) => getComputedStyle(el).transitionDuration),
    ).toBe("0s");
    const before = await text.evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize),
    );
    for (const spread of [120, 140, 160])
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: points(spread),
      });
    await expect
      .poll(() =>
        text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize)),
      )
      .toBeGreaterThan(before * 1.2);
    expect(await page.evaluate(() => (window as any).__fontWrites)).toBe(0);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(text).not.toHaveClass(/is-pinching/);
    await expect
      .poll(() => page.evaluate(() => (window as any).__fontWrites))
      .toBe(1);
    expect(await page.evaluate(() => visualViewport?.scale)).toBe(1);
  });
}

test("Bible vertical intent remains cancelled even when the gesture ends horizontally", async ({
  page,
  context,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/bible");
  const pane = page.locator(".verse-list").first();
  await expect(pane.locator(".verse-text").first()).toBeVisible({
    timeout: 20_000,
  });
  const before = await page.locator(".bible-reader").textContent();
  const box = (await pane.boundingBox())!;
  const cdp = await context.newCDPSession(page);
  const send = (type: string, x: number, y: number) =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 7 }],
    });
  await send("touchStart", box.x + 220, box.y + 160);
  await send("touchMove", box.x + 215, box.y + 120);
  await send("touchMove", box.x + 100, box.y + 115);
  await send("touchEnd", 0, 0);
  await expect(page.locator(".bible-reader")).toHaveText(before!);
});

for (const fullscreen of [false, true]) {
  test(`cancelled lyrics pinch leaves no pending font or pointers (${fullscreen ? "fullscreen" : "reader"})`, async ({
    page,
    context,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    if (fullscreen) {
      await page.locator(".hymn-more-actions > summary").click();
      await page.locator(".hymn-fullscreen-action").click();
    }
    const text = page.locator(
      fullscreen ? ".lyrics-verse-text" : ".lyrics-sheet",
    );
    await expect(text).toBeVisible();
    const before = await text.evaluate((el) => el.style.fontSize);
    const box = (await text.boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const points = (spread: number) =>
      [1, 2].map((id) => ({
        x: box.x + box.width / 2 + ((id === 1 ? -1 : 1) * spread) / 2,
        y: box.y + 70,
        id,
      }));
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(100),
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: points(130),
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchCancel",
      touchPoints: [],
    });
    await expect(text).not.toHaveClass(/is-pinching/);
    await expect
      .poll(() => text.evaluate((el) => el.style.fontSize))
      .toBe(before);
    // A fresh gesture must work after cancellation and the remaining fingers
    // must never be interpreted as a verse/song swipe.
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: points(100),
    });
    await expect(text).toHaveClass(/is-pinching/);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(text).not.toHaveClass(/is-pinching/);
    expect(page.url()).toContain("hymn-001");
  });
}

for (const gesture of [
  "diagonal",
  "multitouch",
  "cancel",
  "horizontal",
] as const) {
  test(`Bible real touch ${gesture} respects chapter intent`, async ({
    page,
    context,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await page.goto("/GYSApp-Tauri/bible");
    const pane = page.locator(".bible-pane").first();
    await expect(pane.locator(".verse-text").first()).toBeVisible({
      timeout: 20_000,
    });
    const box = (await pane.locator(".verse-list").boundingBox())!;
    const cdp = await context.newCDPSession(page);
    const point = (x: number, y: number, id = 1) => ({
      x: box.x + x,
      y: box.y + y,
      id,
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [point(240, 140)],
    });
    if (gesture === "multitouch") {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [point(240, 140), point(280, 140, 2)],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [point(280, 140, 2)],
      });
    }
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(200, gesture === "diagonal" ? 100 : 142)],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(100, gesture === "diagonal" ? 98 : 144)],
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: gesture === "cancel" ? "touchCancel" : "touchEnd",
      touchPoints: [],
    });
    await expect(pane).toHaveAttribute(
      "data-chapter",
      gesture === "horizontal" ? "2" : "1",
    );
  });
}
