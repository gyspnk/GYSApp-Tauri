import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  preparePinnedMidiAsset,
  preparePinnedReaderAssets,
} from "./pinned-reader-fixtures.js";

for (const width of [320, 390, 768, 1440]) {
  test(`MIDI's visible musical controls, playback motion and dock persist at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await preparePinnedMidiAsset(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").click();
    const player = page.locator(".media-surface.is-kidung-media");
    await expect(player).toBeVisible({ timeout: 30_000 });
    const instrument = player.getByRole("combobox", {
      name: "Instrumen MIDI",
      exact: true,
    });
    const key = player.getByRole("combobox", {
      name: "Pilih nada dasar",
      exact: true,
    });
    const transpose = player.locator(".media-transpose");
    await expect(
      player.locator(".media-advanced-controls"),
    ).not.toHaveAttribute("open", "");
    const tempo = player.getByRole("button", {
      name: "Atur tempo MIDI",
      exact: true,
    });
    await expect(tempo).toBeVisible();
    await tempo.click();
    const tempoInput = player.getByRole("slider", {
      name: "Tempo MIDI",
      exact: true,
    });
    await expect(tempoInput).toBeVisible();
    const tempoBox = (await player
      .locator(".media-tempo-popover")
      .boundingBox())!;
    expect(tempoBox.x).toBeGreaterThanOrEqual(0);
    expect(tempoBox.x + tempoBox.width).toBeLessThanOrEqual(width);

    await tempoInput.press("Home");
    await expect(tempoInput).toHaveValue("30");
    await tempoInput.press("End");
    await expect(tempoInput).toHaveValue("220");
    await tempoInput.press("ArrowLeft");
    await expect(tempo).toContainText("219");
    await tempo.press("Escape");
    await expect(tempoInput).not.toBeVisible();
    const toolbar = page.locator(".hymn-text-toolbar");
    const chordIcon = await toolbar
      .locator(".detail-actions button")
      .first()
      .locator("svg")
      .innerHTML();
    const midiIcon = await toolbar.locator(".hymn-midi-toggle svg").innerHTML();
    expect(chordIcon).not.toBe(midiIcon);
    await page.locator(".hymn-more-actions-summary").click();
    const menu = page.locator(".hymn-more-actions-panel");
    await expect(menu).toBeVisible();
    if (width < 700) {
      const menuBox = (await menu.boundingBox())!;
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(
        (await player.boundingBox())!.y,
      );
    }
    expect(
      await menu.evaluate(
        (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
      ),
    ).toBe(6);
    if ([390, 768, 1440].includes(width)) {
      await page.screenshot({ path: `/tmp/gys-kidung-simple-${width}.png` });
    }
    await page.locator(".hymn-more-actions-summary").click();
    await player.locator(".media-advanced-summary").click();
    await expect(instrument).toBeVisible();
    await expect(key).toHaveText("D");
    await expect(transpose.locator("strong")).toHaveText("-1");
    await instrument.click();
    const list = player.locator(".media-instrument-control [role=listbox]");
    const rect = (await list.boundingBox())!;
    expect(rect.y).toBeGreaterThanOrEqual(0);
    expect(rect.y + rect.height).toBeLessThanOrEqual(780);
    await instrument.press("Home");
    // Piano starts at program 0; program 40 is Violin.
    for (let index = 0; index < 40; index++)
      await instrument.press("ArrowDown");
    await instrument.press("Enter");
    await expect(instrument).toHaveText("Violin");
    await key.click();
    await key.press("Home");
    await key.press("Enter");
    await expect(key).toHaveText("C");
    await expect(transpose.locator("strong")).toHaveText("-3");
    await transpose
      .getByRole("button", { name: "Naikkan nada", exact: true })
      .click();
    await expect(transpose.locator("strong")).toHaveText("-2");
    await expect(key).toHaveText("C♯");
    for (const control of await player
      .locator(
        ".media-music-controls .control-select-trigger, .media-music-controls .media-transpose > button",
      )
      .all()) {
      if (!(await control.isVisible())) continue;
      const box = (await control.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(width < 680 ? 39.9 : 35.9);
      expect(box.height).toBeGreaterThanOrEqual(width < 680 ? 39.9 : 35.9);
    }
    for (const control of await player
      .locator(
        ".media-transport-controls button, .media-close-button, .media-minimize, .media-advanced-summary",
      )
      .all()) {
      const box = (await control.boundingBox())!;
      expect(box.width).toBe(width < 680 ? 40 : 36);
      expect(box.height).toBe(width < 680 ? 40 : 36);
    }
    const row = (await player.locator(".media-music-controls").boundingBox())!;
    expect(row.height).toBeLessThan(110);
    await player.locator(".media-advanced-summary").click();
    expect((await player.boundingBox())!.height).toBeLessThan(
      width < 680 ? 164 : 110,
    );
    const play = player.locator(".media-primary-control");
    const button = (await play.boundingBox())!;
    await page.mouse.move(
      button.x + button.width / 2,
      button.y + button.height / 2,
    );
    await page.mouse.down();
    await expect
      .poll(() => play.evaluate((el) => Number(getComputedStyle(el).scale)))
      .toBeLessThan(1);
    await page.mouse.up();
    await expect(player).toHaveAttribute("data-playing", "true", {
      timeout: 30_000,
    });
    await expect(play).toHaveAttribute("aria-label", "Jeda");
    expect(
      await player
        .locator(".media-activity i")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("midi-activity");
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .click();
    await expect(player).toHaveClass(/is-minimized/);
    await player.locator(".media-drag-handle").press("ArrowRight");
    await expect(player).toHaveAttribute("data-edge", "right");
    await page.locator(".hymn-text-title a").click();
    await expect(page).toHaveURL(/\/kidung$/);
    await expect(player).toHaveAttribute("data-playing", "true");
    await player
      .getByRole("button", { name: "Perbesar pemutar", exact: true })
      .click();
    await player.locator(".media-advanced-summary").click();
    await expect(instrument).toHaveText("Violin");
    await expect(key).toHaveText("C♯");
    await expect(transpose.locator("strong")).toHaveText("-2");
    await play.click();
    await expect(player).toHaveAttribute("data-playing", "false");
    expect(
      await player
        .locator(".media-activity i")
        .first()
        .evaluate((el) => getComputedStyle(el).animationName),
    ).toBe("none");
    expect(
      (
        await new AxeBuilder({ page })
          .include(".media-surface")
          .withTags(["wcag2a", "wcag2aa"])
          .analyze()
      ).violations,
    ).toEqual([]);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await player
      .getByRole("button", { name: "Minimalkan pemutar", exact: true })
      .click();
    expect(
      await player.evaluate(
        (el) =>
          el
            .getAnimations({ subtree: true })
            .filter((a) => a.playState === "running").length,
      ),
    ).toBe(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
