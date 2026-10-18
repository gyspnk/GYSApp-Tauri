import { expect, test } from "@playwright/test";
import {
  preparePinnedReaderAssets,
  preparePinnedMidiAsset,
} from "./pinned-reader-fixtures.js";

for (const { width, touch } of [
  { width: 390, touch: true },
  { width: 1440, touch: false },
]) {
  test.describe(`${width}px unified music controls`, () => {
    test.use({ hasTouch: touch });
    test("dock and fullscreen share instruments, bounded tuning and tempo editing", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize({ width, height: 900 });
      await page.route(/^https:\/\//, (route) => route.abort());
      await preparePinnedReaderAssets(page);
      await preparePinnedMidiAsset(page);
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
      const activate = async (selector: string) =>
        touch ? page.locator(selector).tap() : page.locator(selector).click();
      await activate(".hymn-midi-toggle");
      const dock = page.locator(".media-surface.is-kidung-media");
      await expect(dock).toBeVisible({ timeout: 30_000 });
      await activate(".media-tempo-toggle");
      const dockTempo = dock.getByRole("spinbutton", {
        name: "Tempo dalam BPM",
      });
      await expect(dockTempo).toBeVisible();
      await expect
        .poll(async () => {
          const box = await dockTempo.boundingBox();
          return box ? Math.min(box.width, box.height) : 0;
        })
        .toBeGreaterThanOrEqual(touch ? 43.5 : 31.5);
      await dockTempo.fill("108");
      await dockTempo.press("Enter");
      await expect(dock.locator(".media-tempo-toggle")).toContainText("108");
      await activate(".media-tempo-toggle");
      await activate(".hymn-more-actions-summary");
      await activate(".hymn-fullscreen-action");
      const fullscreen = page.locator(".lyrics-panel");
      const toggle = fullscreen.locator(
        ".lyrics-header-actions button[aria-expanded]",
      );
      if ((await toggle.getAttribute("aria-expanded")) === "false")
        await toggle.click();
      const tempo = fullscreen.getByRole("spinbutton", {
        name: "Tempo dalam BPM",
      });
      await expect(tempo).toHaveValue("108");
      await expect
        .poll(async () => {
          const box = await tempo.boundingBox();
          return box ? Math.min(box.width, box.height) : 0;
        })
        .toBeGreaterThanOrEqual(touch ? 43.5 : 31.5);
      await tempo.fill("");
      const storedTempo = () =>
        page.evaluate(
          () =>
            JSON.parse(localStorage.getItem("gys-midi-preferences-v1")!).tempo,
        );
      expect(await storedTempo()).toBe(108);
      await tempo.press("Tab");
      await expect(tempo).toHaveValue("108");
      await tempo.fill("999");
      await tempo.press("Enter");
      await expect(tempo).toHaveValue("220");
      await expect(
        fullscreen.getByRole("button", { name: "Tambah tempo", exact: true }),
      ).toBeDisabled();
      await tempo.fill("112");
      await tempo.press("Enter");
      const instrument = fullscreen.getByRole("combobox", {
        name: "Pilih alat musik",
        exact: true,
      });
      await instrument.focus();
      await instrument.press("Enter");
      await instrument.press("ArrowDown");
      await instrument.press("Enter");
      await expect(instrument).toBeFocused();
      await expect(instrument).toContainText("Bright Acoustic Piano");
      const transpose = fullscreen.locator(".media-transpose");
      const reset = transpose.locator(".media-transpose-reset");
      if (await reset.isEnabled()) await reset.click();
      const up = transpose.getByRole("button", {
        name: "Naikkan nada",
        exact: true,
      });
      for (let i = 0; i < 24; i++) await up.click();
      await expect(up).toBeDisabled();
      await expect(transpose.locator("strong")).toHaveText("+24");
      const key = fullscreen.getByRole("combobox", {
        name: "Pilih nada dasar",
        exact: true,
      });
      await key.focus();
      await key.press("Enter");
      await key.press("ArrowDown");
      await key.press("Enter");
      await expect(transpose.locator("strong")).toHaveText("+13");
      await reset.click();
      await expect(reset).toBeDisabled();
      const overflow = await fullscreen.evaluate(
        (el) => el.scrollWidth - el.clientWidth,
      );
      expect(overflow).toBeLessThanOrEqual(1);
      const target = touch ? 44 : 32;
      for (const control of await fullscreen
        .locator(".media-music-controls button, .midi-tempo-stepper > button")
        .all()) {
        const rect = await control.boundingBox();
        expect(rect!.height).toBeGreaterThanOrEqual(target);
      }
      await page.screenshot({
        path: `/tmp/gys-unified-fullscreen-${width}.png`,
      });
      await fullscreen
        .getByRole("button", { name: "Tutup lirik", exact: true })
        .click();
      await activate(".media-advanced-summary");
      await expect(
        dock.getByRole("combobox", { name: "Instrumen MIDI", exact: true }),
      ).toContainText("Bright Acoustic Piano");
      await expect(dock.locator(".media-transpose strong")).toHaveText("0");
      await expect(dock.locator(".media-tempo-toggle")).toContainText("112");
    });
  });
}
