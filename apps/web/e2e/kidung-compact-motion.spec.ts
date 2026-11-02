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
    const menuOffset = await page
      .locator(".hymn-more-actions-panel")
      .evaluate((panel) => {
        const bounds = panel.getBoundingClientRect();
        const controls = [
          ...panel.querySelectorAll(
            ":scope > button, :scope > details > summary",
          ),
        ]
          .map((el) => el.getBoundingClientRect())
          .sort((a, b) => a.x - b.x);
        const first = controls[0]!;
        const last = controls[controls.length - 1]!;
        return Math.abs(
          (first.x + first.width / 2 + last.x + last.width / 2) / 2 -
            bounds.x -
            bounds.width / 2,
        );
      });
    expect(menuOffset).toBeLessThanOrEqual(1);
    if ([390, 768, 1440].includes(width))
      await page.screenshot({ path: `/tmp/gys-kidung-compact-${width}.png` });
    await page.locator(".hymn-more-actions-summary").click();
    expect(
      await rows(
        ".media-surface .media-meta, .media-surface .media-transport-controls, .media-surface .media-tempo-toggle, .media-surface .media-advanced-summary, .media-surface .media-close-button, .media-surface .media-minimize",
      ),
    ).toBeLessThanOrEqual(2);
    await expect(
      player.getByRole("button", { name: "Atur tempo MIDI", exact: true }),
    ).toBeVisible();
    const alignment = await player.evaluate((el) => {
      const dock = el.getBoundingClientRect();
      const play = el
        .querySelector(".media-playback-row .media-primary-control")!
        .getBoundingClientRect();
      const controls = [
        ...el.querySelectorAll(
          ".media-playback-row button, .media-minimize, .media-close-button, .media-advanced-summary",
        ),
      ];
      return {
        centreOffset: Math.abs(
          play.x + play.width / 2 - dock.x - dock.width / 2,
        ),
        iconOffsets: controls.map((button) => {
          const b = button.getBoundingClientRect();
          const icon = button.querySelector("svg")!.getBoundingClientRect();
          return Math.max(
            Math.abs(b.x + b.width / 2 - icon.x - icon.width / 2),
            Math.abs(b.y + b.height / 2 - icon.y - icon.height / 2),
          );
        }),
      };
    });
    expect(alignment.centreOffset).toBeLessThanOrEqual(1);
    expect(
      alignment.iconOffsets.every((offset) => offset <= 1),
      JSON.stringify(alignment),
    ).toBe(true);
    await player.locator(".media-advanced-summary").click();
    await expect(
      player.getByRole("combobox", { name: "Instrumen MIDI", exact: true }),
    ).toBeVisible();
    await expect(
      player.getByRole("combobox", { name: "Pilih nada dasar", exact: true }),
    ).toBeVisible();
    await expect(
      player.getByRole("heading", { name: "Musik", exact: true }),
    ).toBeVisible();
    await expect(
      player.getByRole("heading", { name: "Pemutaran", exact: true }),
    ).toBeVisible();
    const labelledActions = await player
      .locator(
        ".media-queue-badge, .media-midi-actions .media-control:has(svg)",
      )
      .evaluateAll((buttons) =>
        buttons.map((button) => {
          const icon = button.querySelector("svg")!.getBoundingClientRect();
          const label = button.querySelector("span")!.getBoundingClientRect();
          return {
            gap: label.x - icon.right,
            vertical: Math.abs(
              label.y + label.height / 2 - icon.y - icon.height / 2,
            ),
          };
        }),
      );
    expect(
      labelledActions.every(
        (action) => action.gap >= 0 && action.gap <= 10 && action.vertical <= 1,
      ),
      JSON.stringify(labelledActions),
    ).toBe(true);
    const targets = await player
      .locator(".media-playback-row button")
      .evaluateAll((els) =>
        els.map((el) => ({
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
        })),
      );
    const minimumTarget = await page.evaluate(() =>
      matchMedia("(pointer: coarse)").matches ? 44 : 32,
    );
    expect(
      targets.every(
        (target) =>
          target.width >= minimumTarget && target.height >= minimumTarget,
      ),
    ).toBe(true);
    expect(
      await player.evaluate((el) => el.scrollWidth - el.clientWidth),
    ).toBeLessThanOrEqual(2);
    if ([390, 768, 1440].includes(width))
      await page.screenshot({ path: `/tmp/gys-kidung-music-${width}.png` });
    await player.locator(".media-advanced-summary").click();
    await page.locator(".hymn-more-actions-summary").click();
    await page
      .getByRole("button", { name: "Mode lirik layar penuh", exact: true })
      .click();
    const lyrics = page.locator(".lyrics-panel");
    await expect(lyrics).toBeVisible();
    expect(
      await rows(".lyrics-title, .lyrics-header-actions, .lyrics-transport"),
    ).toBeLessThanOrEqual(2);
    const controlsToggle = lyrics.getByRole("button", {
      name: "Tampilkan kontrol lain",
      exact: true,
    });
    await controlsToggle.click();
    await expect(lyrics.locator(".lyrics-extra")).toBeVisible();
    const bounds = (await lyrics.locator(".lyrics-extra").boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await lyrics
      .getByRole("spinbutton", { name: "Tempo MIDI", exact: true })
      .press("Escape");
    await expect(lyrics.locator(".lyrics-extra")).toHaveCount(0);
    await expect(controlsToggle).toBeFocused();
    await expect(lyrics).toBeVisible();
    await lyrics
      .getByRole("button", { name: "Tutup lirik", exact: true })
      .click();
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
  const immediately = await player
    .locator(".media-minimize")
    .evaluate((button) => {
      (button as HTMLButtonElement).click();
      const surface = button.closest(".media-surface")!;
      return {
        minimized: surface.classList.contains("is-minimized"),
        exitDuration: surface
          .getAnimations()
          .find((a) => a.id === "gys-midi-dock-exit")
          ?.effect?.getTiming().duration,
      };
    });
  // Measure in the same browser task; Playwright can return from a click after
  // the 200 ms exit already ended on a busy runner.
  expect(immediately).toEqual({ minimized: false, exitDuration: 200 });
  await expect(player).toHaveClass(/is-minimized/);
  // The 480 ms enter animation can finish before Playwright returns from the
  // click on a loaded runner, so record what the surface animates from inside
  // the page while the restore is triggered.
  await player.evaluate((surface) => {
    const seen: Array<{ id: string; duration: number | null }> = [];
    (window as Window & { __dockAnimations?: typeof seen }).__dockAnimations =
      seen;
    const started = performance.now();
    const sample = () => {
      for (const animation of surface.getAnimations()) {
        if (!seen.some((entry) => entry.id === animation.id))
          seen.push({
            id: animation.id,
            duration: animation.effect?.getTiming().duration ?? null,
          });
      }
      if (performance.now() - started < 1_500) requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await player.locator(".media-drag-handle").click();
  await expect(player).not.toHaveClass(/is-minimized/);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __dockAnimations?: unknown[] })
            .__dockAnimations ?? [],
      ),
    )
    .toContainEqual({ id: "gys-midi-dock-enter", duration: 480 });
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
