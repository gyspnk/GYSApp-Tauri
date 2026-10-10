import { expect, test } from "@playwright/test";
import {
  preparePinnedReaderAssets,
  preparePinnedMidiAsset,
} from "./pinned-reader-fixtures.js";

for (const width of [320, 390, 768, 1440]) {
  test(`Kidung menu and MIDI dock use at most two control rows at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await preparePinnedMidiAsset(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").click();
    const player = page.locator(".media-surface.is-kidung-media");
    await expect(player).toBeVisible({ timeout: 30_000 });
    const rows = (selector: string) =>
      page.locator(selector).evaluateAll((els) => {
        const values: number[] = [];
        for (const el of els) {
          const r = el.getBoundingClientRect();
          if (!r.width || !r.height) continue;
          const y = r.y + r.height / 2;
          if (!values.some((value) => Math.abs(value - y) < 8)) values.push(y);
        }
        return values.length;
      });
    await page.locator(".hymn-more-actions-summary").click();
    const menuControls =
      ".hymn-more-actions-panel > button, .hymn-reader-settings-summary, .hymn-segmented-toolbar button";
    const positions = await page.locator(menuControls).evaluateAll((els) =>
      els.map((el) => ({
        name: el.getAttribute("aria-label") || el.textContent,
        y: el.getBoundingClientRect().y,
        h: el.getBoundingClientRect().height,
      })),
    );
    expect(
      await rows(menuControls),
      JSON.stringify(positions),
    ).toBeLessThanOrEqual(2);
    if ([390, 768, 1440].includes(width))
      await page.screenshot({ path: `/tmp/gys-kidung-compact-${width}.png` });
    await page.locator(".hymn-more-actions-summary").click();
    expect(
      await rows(
        ".media-surface .media-meta, .media-surface .media-transport-controls, .media-surface .media-seek-time, .media-surface .media-tempo-toggle, .media-surface .media-advanced-summary, .media-surface .media-close-button, .media-surface .media-minimize",
      ),
    ).toBeLessThanOrEqual(2);
    await expect(
      player.getByRole("button", { name: "Atur tempo MIDI", exact: true }),
    ).toBeVisible();
    await player.locator(".media-advanced-summary").click();
    await expect(
      player.getByRole("combobox", { name: "Instrumen MIDI", exact: true }),
    ).toBeVisible();
    await expect(
      player.getByRole("combobox", { name: "Pilih nada dasar", exact: true }),
    ).toBeVisible();
  });
}

test("MIDI dock fades the old geometry before restoring the new geometry", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await preparePinnedMidiAsset(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  const player = page.locator(".media-surface.is-kidung-media");
  await player.locator(".media-minimize").click();
  // A click starts a full exit; the layout does not switch on the same frame.
  await expect(player).not.toHaveClass(/is-minimized/);
  await expect(player).toHaveClass(/is-minimized/);
  await player.locator(".media-drag-handle").click();
  await expect(player).not.toHaveClass(/is-minimized/);
  const animations = await player.evaluate((el) =>
    el
      .getAnimations()
      .map((a) => ({ id: a.id, duration: a.effect!.getTiming().duration })),
  );
  expect(animations).toContainEqual({
    id: "gys-midi-dock-enter",
    duration: 480,
  });
  await expect
    .poll(() => player.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  await player.locator(".media-minimize").click();
  await page.evaluate(() => {
    localStorage.setItem("gys-media-minimized", "0");
    window.dispatchEvent(new Event("gys-media-preference-change"));
  });
  await expect(player).not.toHaveClass(/is-minimized/);
  await expect
    .poll(() => player.evaluate((el) => getComputedStyle(el).opacity))
    .toBe("1");
  expect(
    await player.evaluate(
      (el) =>
        el.getAnimations().filter((a) => a.id.startsWith("gys-midi-dock"))
          .length,
    ),
  ).toBe(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await player.locator(".media-minimize").click();
  await expect(player).toHaveClass(/is-minimized/);
  expect(
    await player.evaluate(
      (el) =>
        el.getAnimations().filter((a) => a.id.startsWith("gys-midi-dock"))
          .length,
    ),
  ).toBe(0);
});
