import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { preparePinnedMidiAsset } from "./pinned-reader-fixtures.js";

for (const viewport of [
  { width: 320, height: 568 },
  { width: 667, height: 375 },
  { width: 1440, height: 800 },
]) {
  test(`MIDI scrubbing commits once and inline tempo stays usable at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedMidiAsset(page);
    await page.addInitScript(() => {
      localStorage.setItem("gys-media-minimized", "0");
      const state = window as Window & { midiStarts: number[] };
      state.midiStarts = [];
      const start = AudioBufferSourceNode.prototype.start;
      AudioBufferSourceNode.prototype.start = function (
        when = 0,
        offset = 0,
        ...args
      ) {
        state.midiStarts.push(offset);
        Reflect.apply(start, this, [when, offset, ...args]);
      };
    });
    const starts = () =>
      page.evaluate(
        () => (window as Window & { midiStarts: number[] }).midiStarts,
      );
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").click();
    const player = page.locator(".media-surface.is-kidung-media");
    const play = player.locator(".media-primary-control");
    await play.click();
    await expect(play).toHaveAttribute("aria-label", "Jeda", {
      timeout: 30_000,
    });
    const before = (await starts()).length;
    const seek = player.getByRole("slider", { name: "Posisi MIDI" });
    const box = (await seek.boundingBox())!;
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.6, box.y + box.height / 2, {
      steps: 8,
    });
    const preview = Number(await seek.inputValue());
    expect(preview).toBeGreaterThan(
      Number(await seek.getAttribute("max")) * 0.5,
    );
    expect((await starts()).length).toBe(before);
    await expect(play).toHaveAttribute("aria-label", "Jeda");
    const time = `${Math.floor(preview / 60)}:${String(Math.floor(preview % 60)).padStart(2, "0")}`;
    await expect(player.locator(".media-seek-time > span").first()).toHaveText(
      time,
    );
    await page.mouse.up();
    await expect.poll(async () => (await starts()).length).toBe(before + 1);
    expect((await starts()).at(-1)).toBeCloseTo(preview, 1);
    await expect(play).toHaveAttribute("aria-label", "Jeda");
    await seek.focus();
    await seek.press("ArrowRight");
    await expect.poll(async () => (await starts()).length).toBe(before + 2);

    await player.locator(".media-advanced-summary").click();
    await player.locator(".media-tempo-toggle").click();
    const tempo = player.locator(".media-tempo-popover input");
    await tempo.scrollIntoViewIfNeeded();
    await expect(tempo).toBeVisible();
    expect(
      await tempo.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return (
          document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) ===
          element
        );
      }),
    ).toBe(true);
    const value = Number(await tempo.inputValue());
    await tempo.focus();
    await tempo.press("ArrowRight");
    await expect(tempo).toHaveValue(String(value + 1));
    await expect(player.locator(".media-tempo-popover")).toContainText(
      `${value + 1} BPM`,
    );
    const settings = (await player
      .locator(".media-advanced-panel")
      .boundingBox())!;
    expect(settings.y).toBeGreaterThanOrEqual(0);
    expect(settings.y + settings.height).toBeLessThanOrEqual(
      (await player.boundingBox())!.y,
    );
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(viewport.width);
    const audit = await new AxeBuilder({ page })
      .include(".media-surface")
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    expect(audit.violations).toEqual([]);
  });
}
