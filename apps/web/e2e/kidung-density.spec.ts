import { expect, test } from "@playwright/test";
import {
  preparePinnedReaderAssets,
  preparePinnedMidiAsset,
} from "./pinned-reader-fixtures.js";

for (const { width, touch } of [
  { width: 320, touch: true },
  { width: 390, touch: true },
  { width: 768, touch: true },
  { width: 1440, touch: false },
]) {
  test.describe(`${width}px ${touch ? "touch" : "mouse"}`, () => {
    test.use({ hasTouch: touch });
    test("reader chrome stays compact without clipping controls", async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 844 });
      await page.route(/^https:\/\//, (route) => route.abort());
      await preparePinnedReaderAssets(page);
      await preparePinnedMidiAsset(page);
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
      if (touch) await page.locator(".hymn-midi-toggle").tap();
      else await page.locator(".hymn-midi-toggle").click();
      const player = page.locator(".media-surface.is-kidung-media");
      await expect(player).toBeVisible({ timeout: 30_000 });
      if (touch) await player.locator(".media-advanced-summary").tap();
      else await player.locator(".media-advanced-summary").click();
      const metrics = await page.evaluate(() => {
        const rect = (selector: string) =>
          document.querySelector(selector)!.getBoundingClientRect().toJSON();
        return {
          header: rect(".detail-hero"),
          dock: rect(".media-surface.is-kidung-media"),
          panel: rect(".media-advanced-panel"),
        };
      });
      console.log(
        `density ${width} ${touch ? "touch" : "mouse"} ${JSON.stringify({ header: metrics.header.height, dock: metrics.dock.height, panel: metrics.panel.height })}`,
      );
      expect(metrics.header.height).toBeLessThanOrEqual(touch ? 56 : 48);
      expect(metrics.dock.height).toBeLessThanOrEqual(touch ? 104 : 84);
      expect(metrics.panel.height).toBeLessThanOrEqual(touch ? 276 : 230);
      await expect(
        page.getByRole("heading", {
          level: 1,
          name: "Pujilah Allah Yang Maha Esa",
          exact: true,
        }),
      ).toBeVisible();
      const target = touch ? 44 : 32;
      const toolbarTargets = await page
        .locator(
          ".hymn-text-toolbar .detail-actions > button, .hymn-partitur-toggle, .hymn-more-actions-summary",
        )
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().toJSON()),
        );
      expect(
        toolbarTargets.every(
          (control) => control.width >= target && control.height >= target,
        ),
      ).toBe(true);
      const controls = await player
        .locator(
          ".media-playback-row button, .media-advanced-summary, .media-minimize, .media-close-button",
        )
        .evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect().toJSON()),
        );
      expect(
        controls.every(
          (control) => control.width >= target && control.height >= target,
        ),
      ).toBe(true);
      expect(
        await player.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await player
        .getByRole("combobox", { name: "Instrumen MIDI", exact: true })
        .focus();
      await page.keyboard.press("Enter");
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Enter");
      await expect(
        player.getByRole("combobox", { name: "Instrumen MIDI", exact: true }),
      ).toBeFocused();
      await expect(
        player.locator(".media-instrument-control .control-select-menu"),
      ).toHaveCount(0);
      await expect
        .poll(() =>
          player.evaluate(
            (el) =>
              el
                .getAnimations()
                .filter(
                  (animation) =>
                    animation.playState === "running" &&
                    Number(animation.effect?.getTiming().iterations) !==
                      Infinity,
                ).length,
          ),
        )
        .toBe(0);
      expect(
        (await player.locator(".media-advanced-panel").boundingBox())!.height,
      ).toBeLessThanOrEqual(touch ? 276 : 230);
      const titleBounds = await player
        .locator(".media-context-link")
        .evaluate((button) => ({
          button: button.getBoundingClientRect().toJSON(),
          title: button
            .querySelector("strong")!
            .getBoundingClientRect()
            .toJSON(),
        }));
      expect(titleBounds.title.y).toBeGreaterThanOrEqual(
        titleBounds.button.y - 1,
      );
      expect(titleBounds.title.bottom).toBeLessThanOrEqual(
        titleBounds.button.bottom + 1,
      );
      await page.mouse.move(0, 0);
      await page.screenshot({ path: `/tmp/gys-density-${width}.png` });
    });
  });
}
