import { expect, test } from "@playwright/test";
import {
  preparePinnedMidiAsset,
  preparePinnedReaderAssets,
} from "./pinned-reader-fixtures.js";

test("enabled MIDI warms silently and reuses playable buffers across keys and reopening", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await preparePinnedMidiAsset(page);
  await page.addInitScript(() => {
    const state = window as Window & {
      midiWorkerRenders: number;
      midiWorkersCreated: number;
    };
    state.midiWorkerRenders = 0;
    state.midiWorkersCreated = 0;
    const OriginalWorker = Worker;
    window.Worker = class extends OriginalWorker {
      constructor(...args: ConstructorParameters<typeof Worker>) {
        super(...args);
        if (!String(args[0]).includes("midi-render-worker")) return;
        state.midiWorkersCreated++;
        this.addEventListener("message", (event) => {
          if (event.data.type === "rendered") state.midiWorkerRenders++;
        });
      }
    };
  });
  const counts = () =>
    page.evaluate(() => {
      const state = window as Window & {
        midiWorkerRenders: number;
        midiWorkersCreated: number;
      };
      return {
        renders: state.midiWorkerRenders,
        workers: state.midiWorkersCreated,
      };
    });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  const player = page.locator(".media-surface.is-kidung-media");
  await expect(player).not.toHaveClass(/is-minimized/);
  await expect(
    player.locator(".media-previous-control, .media-next-control"),
  ).toHaveCount(2);
  await expect(player.locator(".media-previous-control")).toBeDisabled();
  await expect(player.locator(".media-next-control")).toBeEnabled();
  // PDF defaults can supersede an early warm before metadata settles. Count
  // cache reuse from the final key instead of assuming one worker at startup.
  await expect(
    player.getByRole("combobox", { name: "Pilih nada dasar" }),
  ).toHaveText("D");
  await expect
    .poll(() => counts().then((value) => value.renders), { timeout: 30_000 })
    .toBeGreaterThan(0);
  const warmed = await counts();
  expect(warmed.workers).toBeGreaterThan(0);
  const play = player.getByRole("button", { name: "Putar", exact: true });
  await expect(play).toBeVisible();
  await play.click();
  await expect(
    player.getByRole("button", { name: "Jeda", exact: true }),
  ).toBeVisible();
  expect(await counts()).toEqual(warmed);
  const transpose = player.locator(".media-transpose");
  await transpose.getByRole("button", { name: "Naikkan nada" }).click();
  await expect(
    player.getByRole("button", { name: "Jeda", exact: true }),
  ).toBeVisible({ timeout: 30_000 });
  const changed = { renders: warmed.renders + 1, workers: warmed.workers };
  await expect.poll(counts).toEqual(changed);
  await transpose.getByRole("button", { name: "Turunkan nada" }).click();
  await expect(
    player.getByRole("button", { name: "Jeda", exact: true }),
  ).toBeVisible();
  expect(await counts()).toEqual(changed);
  await page.locator(".hymn-midi-toggle").click();
  await expect(player).toHaveCount(0);
  await page.locator(".hymn-midi-toggle").click();
  await player.getByRole("button", { name: "Putar", exact: true }).click();
  await expect(
    player.getByRole("button", { name: "Jeda", exact: true }),
  ).toBeVisible();
  expect(await counts()).toEqual(changed);
  await expect(player).toHaveAttribute("data-backend", "fluidsynth");
});
