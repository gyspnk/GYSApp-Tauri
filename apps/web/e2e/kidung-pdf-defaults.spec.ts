import { expect, test } from "@playwright/test";
import {
  preparePinnedMidiAsset,
  preparePinnedReaderAssets,
} from "./pinned-reader-fixtures.js";

async function prepare(page: import("@playwright/test").Page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await preparePinnedMidiAsset(page);
}

test("cold playback waits for the PDF tempo instead of reusing a saved manual tempo", async ({
  page,
}) => {
  await prepare(page);
  await page.addInitScript(() =>
    localStorage.setItem(
      "gys-midi-preferences-v1",
      JSON.stringify({ tempo: 150, tempoOverride: true }),
    ),
  );
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route(/^https:\/\/.*\.pdf(?:\?.*)?$/i, async (route) => {
    requests++;
    await ready;
    await route.fallback();
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  try {
    await expect.poll(() => requests).toBeGreaterThan(0);
    await expect(page.locator(".hymn-midi-toggle")).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(page.locator(".media-surface.is-kidung-media")).toHaveCount(0);
  } finally {
    release();
  }
  const player = page.locator(".media-surface.is-kidung-media");
  await expect(player.locator(".media-tempo-toggle")).toContainText("76");
  await expect(page.locator(".hymn-midi-toggle")).toHaveAttribute(
    "aria-busy",
    "false",
  );
  await player.locator(".media-primary-control").click();
  await expect(player).toHaveAttribute("data-playing", "true", {
    timeout: 30_000,
  });
  await expect(player.locator(".media-tempo-toggle")).toContainText("76");
});

test("the avoid-flat/sharp toggle restores the original PDF pitch and persists", async ({
  page,
}) => {
  await prepare(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  const player = page.locator(".media-surface.is-kidung-media");
  await expect(player).toBeVisible({ timeout: 30_000 });
  const offset = player.locator(".media-transpose strong");
  await expect(offset).toHaveText("-1");
  await player.locator(".media-advanced-summary").click();
  await player
    .getByRole("button", { name: "Turunkan nada", exact: true })
    .click();
  await expect(offset).toHaveText("-2");
  await page.locator(".hymn-text-title a").click();
  await page.locator('a.nav-item[href$="/lainnya"]').click();
  await page.locator('[data-setting="hymns"] > summary').click();
  const avoid = page.getByRole("checkbox", { name: /Hindari mol\/kres/ });
  await expect(avoid).toBeChecked();
  await avoid.uncheck();
  await expect(offset).toHaveText("0");
  await expect(
    player.locator(".media-key-control .control-select-trigger"),
  ).toHaveText("D♯");
  await avoid.check();
  await expect(offset).toHaveText("-1");
  await avoid.uncheck();
  await expect(offset).toHaveText("0");
  await page.reload();
  await page.locator('[data-setting="hymns"] > summary').click();
  await expect(avoid).not.toBeChecked();
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  await expect(offset).toHaveText("0");
});
