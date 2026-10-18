import { expect, test, type Page } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

async function openLyrics(page: Page, fontSize: number | null = 44) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.addInitScript((fontSize) => {
    if (fontSize !== null) {
      localStorage.setItem(
        "gys-hymn-typography-v1",
        JSON.stringify({
          version: 1,
          songs: { "hymn-001": { fontSize, lineHeight: 1.5 } },
        }),
      );
      localStorage.setItem("gys-lyrics-font-size", String(fontSize));
    }
    localStorage.setItem("gys-lyrics-show-chords", "0");
  }, fontSize);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
}

async function openFullscreen(page: Page) {
  // Warm the actual chord data before opening the separate reader.
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(page.locator(".chord-visual-marker").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.locator(".hymn-more-actions-summary").click();
  await page
    .getByRole("button", { name: "Mode lirik layar penuh", exact: true })
    .click();
  await expect(page.locator(".lyrics-panel")).toBeVisible();
}

for (const manual of [true, false]) {
  test(`${manual ? "manual" : "automatic"} wrapped lyrics recover their original spacing after repeated chord toggles`, async ({
    page,
  }) => {
    await openLyrics(page, manual ? 44 : null);
    const sheet = page.locator(".lyrics-sheet");
    await expect(sheet).toBeVisible();
    const measure = () =>
      sheet.locator("p").evaluateAll((ps) =>
        ps.map((p) => ({
          height: p.getBoundingClientRect().height,
          font: getComputedStyle(p).fontSize,
        })),
      );
    await page.waitForTimeout(450);
    const original = await measure();
    for (let i = 0; i < 3; i++) {
      await page
        .getByRole("button", { name: "Tampilkan chord", exact: true })
        .click();
      await expect(sheet.locator(".chord-visual-marker").first()).toBeVisible({
        timeout: 30_000,
      });
      await page.waitForTimeout(500);
      await page
        .getByRole("button", { name: "Sembunyikan chord", exact: true })
        .click();
      await page.waitForTimeout(500);
      const after = await measure();
      for (let line = 0; line < original.length; line++) {
        expect(after[line]!.font).toBe(original[line]!.font);
        expect(
          Math.abs(after[line]!.height - original[line]!.height),
        ).toBeLessThanOrEqual(2);
      }
    }
  });
}

test("fullscreen chord toggles restore the same fitted scale and explicit font adjustment stays manual", async ({
  page,
}) => {
  await openLyrics(page);
  await openFullscreen(page);
  const panel = page.locator(".lyrics-panel");
  const text = panel.locator(".lyrics-verse-text");
  const measure = () =>
    text.evaluate((el) => ({
      font: getComputedStyle(el).fontSize,
      heights: Array.from(
        el.querySelectorAll("p"),
        (p) => p.getBoundingClientRect().height,
      ),
    }));
  await page.waitForTimeout(500);
  const original = await measure();
  for (let i = 0; i < 3; i++) {
    await panel
      .getByRole("button", { name: "Tampilkan chord", exact: true })
      .click();
    await expect(text.locator(".chord-visual-marker").first()).toBeVisible();
    await page.waitForTimeout(500);
    await panel
      .getByRole("button", { name: "Sembunyikan chord", exact: true })
      .click();
    await page.waitForTimeout(500);
    expect(await measure()).toEqual(original);
  }
  await panel
    .getByRole("button", { name: "Tampilkan kontrol lain", exact: true })
    .click();
  await panel
    .getByRole("button", { name: "Perbesar font", exact: true })
    .click();
  const rootScale = await page.evaluate(
    () => parseFloat(getComputedStyle(document.documentElement).fontSize) / 16,
  );
  await expect
    .poll(async () => parseFloat((await measure()).font))
    .toBe(48 * rootScale);
  await panel
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await page.waitForTimeout(500);
  expect(parseFloat((await measure()).font)).toBe(48 * rootScale);
});

test("zoom animates words to their new rows, settles chord alignment, and respects reduced motion", async ({
  page,
}) => {
  await openLyrics(page, 20);
  const sheet = page.locator(".lyrics-sheet");
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(sheet.locator(".chord-visual-marker").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.waitForTimeout(500);
  const before = await sheet.locator("[data-reflow-key]").evaluateAll((els) =>
    els.map((el) => ({
      key: (el as HTMLElement).dataset.reflowKey,
      top: (el as HTMLElement).offsetTop,
    })),
  );
  await sheet.evaluate((el) => {
    const animate = HTMLElement.prototype.animate;
    HTMLElement.prototype.animate = function (frames, options) {
      const animation = animate.call(this, frames, options);
      if (this.matches("[data-reflow-key]")) animation.pause();
      return animation;
    };
    el.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: -10000,
        bubbles: true,
        cancelable: true,
      }),
    );
  });
  await expect
    .poll(() =>
      sheet.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.id === "gys-lyrics-reflow").length,
      ),
    )
    .toBeGreaterThan(0);
  const moved = await sheet.locator("[data-reflow-key]").evaluateAll(
    (els, before) =>
      els.some((el) => {
        const node = el as HTMLElement;
        return before.some(
          (old) =>
            old.key === node.dataset.reflowKey &&
            Math.abs(old.top - node.offsetTop) > 10,
        );
      }),
    before,
  );
  expect(moved, "at least one word changes its actual layout row").toBe(true);
  expect(
    await sheet.evaluate((el) =>
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.id === "gys-lyrics-reflow")
        .every((a) => a.effect!.getTiming().duration === 340),
    ),
  ).toBe(true);
  await sheet.evaluate((el) =>
    el.getAnimations({ subtree: true }).forEach((a) => a.finish()),
  );
  await expect
    .poll(() =>
      sheet.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.id === "gys-lyrics-reflow").length,
      ),
    )
    .toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await sheet.evaluate((el) =>
    el.dispatchEvent(
      new WheelEvent("wheel", {
        ctrlKey: true,
        deltaY: 10000,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  await page.waitForTimeout(100);
  expect(
    await sheet.evaluate(
      (el) =>
        el
          .getAnimations({ subtree: true })
          .filter((a) => a.id === "gys-lyrics-reflow").length,
    ),
  ).toBe(0);
});

for (const fullscreen of [false, true]) {
  test(`${fullscreen ? "fullscreen" : "main"} lyric reflow stays out of a real pinch and cancellation clears the gesture`, async ({
    page,
    context,
  }) => {
    await openLyrics(page, 20);
    if (fullscreen) await openFullscreen(page);
    const text = page.locator(
      fullscreen ? ".lyrics-verse-text" : ".lyrics-sheet",
    );
    await page.waitForTimeout(500);
    const box = (await text.boundingBox())!;
    const font = () =>
      text.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const initial = await font();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setTouchEmulationEnabled", {
      enabled: true,
      maxTouchPoints: 2,
    });
    const touches = (distance: number) =>
      [1, 2].map((id) => ({
        id,
        x: box.x + box.width / 2 + (id === 1 ? -distance / 2 : distance / 2),
        y: Math.max(box.y, 0) + Math.min(100, box.height / 3),
      }));
    let active = false;
    try {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: touches(100),
      });
      active = true;
      for (let d = 110; d <= 180; d += 10) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: touches(d),
        });
        await page.evaluate(() => new Promise(requestAnimationFrame));
      }
      await expect(text).toHaveClass(/is-pinching/);
      expect(await font()).toBeCloseTo(initial * 1.8, 0);
      expect(
        await text.evaluate(
          (el) =>
            el
              .getAnimations({ subtree: true })
              .filter((a) => a.id === "gys-lyrics-reflow").length,
        ),
      ).toBe(0);
      const preview = await font();
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      active = false;
      await expect(text).not.toHaveClass(/is-pinching/);
      expect(await font()).toBeCloseTo(preview, 1);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: touches(100),
      });
      active = true;
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: touches(130),
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchCancel",
        touchPoints: [],
      });
      active = false;
      await expect(text).not.toHaveClass(/is-pinching/);
      await page.waitForTimeout(400);
      expect(await font()).toBeCloseTo(preview, 1);
    } finally {
      if (active)
        await cdp
          .send("Input.dispatchTouchEvent", {
            type: "touchCancel",
            touchPoints: [],
          })
          .catch(() => {});
      await cdp.detach();
    }
  });
}
