import { expect, test } from "@playwright/test";
import {
  preparePinnedMidiAsset,
  preparePinnedReaderAssets,
} from "./pinned-reader-fixtures.js";

for (const width of [390, 768, 1440]) {
  test(`MIDI edge player drags, restores, and persists across routes at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await preparePinnedMidiAsset(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.getByRole("button", { name: "Buka MIDI", exact: true }).click();
    const player = page.locator(".media-surface.is-kidung-media");
    await expect(player).toBeVisible({ timeout: 30_000 });
    await expect(player).not.toHaveClass(/is-minimized/);
    if (width === 390) {
      await player.getByRole("button", { name: "Putar", exact: true }).click();
      await expect(player).toHaveAttribute("data-playing", "true", {
        timeout: 30_000,
      });
    }
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .click();
    await expect(player).toHaveClass(/is-minimized/);
    await expect
      .poll(() =>
        player.evaluate(
          (node) =>
            node
              .getAnimations()
              .filter((animation) => animation.playState === "running").length,
        ),
      )
      .toBe(0);
    if (width === 390)
      await expect(player).toHaveAttribute("data-playing", "true");
    const grip = player.locator(".media-drag-handle");
    await expect(player.locator("button:visible")).toHaveCount(1);
    expect((await player.boundingBox())!.height).toBeLessThanOrEqual(60);
    const box = await grip.boundingBox();
    await page.mouse.move(box!.x + 20, box!.y + 20);
    await page.mouse.down();
    await page.mouse.move(width - 25, 210, { steps: 10 });
    await page.mouse.up();
    await expect(player).toHaveAttribute("data-edge", "right");
    await expect(player).toHaveClass(/is-minimized/);
    await expect
      .poll(async () => Math.round((await player.boundingBox())!.x))
      .toBe(width - 44);
    await expect
      .poll(() =>
        page.evaluate(
          () => JSON.parse(localStorage.getItem("gys-midi-edge")!).side,
        ),
      )
      .toBe("right");
    await page.locator(".hymn-text-title a").click();
    await expect(page).toHaveURL(/\/kidung$/);
    await expect(player).toBeVisible();
    await page.locator('a.nav-item[href$="/bible"]').click();
    await expect(page).toHaveURL(/\/bible/);
    await expect(player).toBeVisible();
    await expect(player).toHaveAttribute("data-edge", "right");
    await player
      .getByRole("button", { name: "Perbesar pemutar", exact: true })
      .click();
    await expect(player).not.toHaveClass(/is-minimized/);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("gys-media-minimized")),
      )
      .toBe("0");
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .click();
    await expect(player).toHaveClass(/is-minimized/);
    await expect
      .poll(() =>
        page.evaluate(() => localStorage.getItem("gys-media-minimized")),
      )
      .toBe("1");
    await grip.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(player).toHaveAttribute("data-edge", "left");
    await page.keyboard.press("End");
    await expect
      .poll(
        async () =>
          (await player.boundingBox())!.y +
          (await player.boundingBox())!.height,
      )
      .toBeLessThanOrEqual(892);
  });
}

for (const width of [390, 1440]) {
  test(`MIDI dock animation starts at its previous rectangle at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.addInitScript(() =>
      localStorage.setItem("gys-media-minimized", "1"),
    );
    await preparePinnedMidiAsset(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").click();
    const player = page.locator(".media-surface.is-kidung-media");
    for (const label of ["Perbesar pemutar", "Minimalkan pemutar"]) {
      const before = (await player.boundingBox())!;
      await player.getByRole("button", { name: label, exact: true }).click();
      const start = await player.evaluate(async (element) => {
        const animation = element
          .getAnimations()
          .find((a) => a.effect?.getTiming().duration === 320);
        if (!animation) throw new Error("Dock transition animation is missing");
        animation.pause();
        animation.currentTime = 0;
        await new Promise(requestAnimationFrame);
        const r = element.getBoundingClientRect();
        const result = { x: r.x, y: r.y, width: r.width, height: r.height };
        animation.finish();
        return result;
      });
      for (const key of ["x", "y"] as const) {
        expect(Math.abs(start[key] - before[key]), key).toBeLessThanOrEqual(1);
      }
    }
  });
}

test.describe("touch edge tab", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 780 } });

  test("a touch drag keeps the player docked and a tap restores its controls", async ({
    page,
  }) => {
    await preparePinnedReaderAssets(page);
    await preparePinnedMidiAsset(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").tap();
    const player = page.locator(".media-surface.is-kidung-media");
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .tap();
    await expect
      .poll(async () => Math.round((await player.boundingBox())!.x))
      .toBe(0);
    const tab = player.getByRole("button", {
      name: "Perbesar pemutar",
      exact: true,
    });
    await tab.tap();
    await expect(player).not.toHaveClass(/is-minimized/);
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .tap();
    await expect
      .poll(async () => Math.round((await player.boundingBox())!.x))
      .toBe(0);
    const box = (await tab.boundingBox())!;
    // Real touch events exercise pointer capture and the tap/drag threshold.
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ x: box.x + 14, y: box.y + 30 }],
    });
    for (let step = 1; step <= 8; step++) {
      await session.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 14 + (360 * step) / 8, y: box.y + 30 - (60 * step) / 8 },
        ],
      });
    }
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await expect(player).toHaveAttribute("data-edge", "right");
    await expect(player).toHaveClass(/is-minimized/);
    await expect
      .poll(async () => Math.round((await player.boundingBox())!.x))
      .toBe(346);
    await tab.tap();
    await expect(player).not.toHaveClass(/is-minimized/);
    await expect(
      player.getByRole("combobox", { name: "Instrumen MIDI", exact: true }),
    ).toBeVisible();
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .tap();
    await expect(player).toHaveClass(/is-minimized/);
    await page.getByRole("button", { name: "Partitur", exact: true }).tap();
    await expect(page.locator(".hymn-detail-page")).toHaveClass(
      /is-pdf-viewer/,
    );
    await expect
      .poll(async () => Math.round((await player.boundingBox())!.x))
      .toBe(346);
    await expect
      .poll(async () => Math.round((await player.boundingBox())!.height))
      .toBe(60);
    await tab.tap();
    await expect(player).not.toHaveClass(/is-minimized/);
    await session.detach();
  });
});
