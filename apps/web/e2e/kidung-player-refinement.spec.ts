import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import {
  preparePinnedReaderAssets,
  preparePinnedMidiAsset,
} from "./pinned-reader-fixtures.js";

test("text-only reader leaves binary and audio preload dormant", async ({
  page,
}) => {
  const binaries: string[] = [];
  page.on("request", (request) => {
    if (/\.(?:mid|midi|pdf|sf2)(?:\?|$)/i.test(request.url()))
      binaries.push(request.url());
  });
  await preparePinnedReaderAssets(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await expect(page.locator(".hymn-midi-toggle")).not.toHaveAttribute(
    "aria-controls",
  );
  await page.waitForTimeout(1200);
  expect(binaries).toEqual([]);
  await page
    .getByRole("button", { name: "Bait berikutnya", exact: true })
    .click();
  await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
    "aria-label",
    /bait 2$/,
  );
  expect(binaries).toEqual([]);
});

for (const width of [320, 390, 768, 1440]) {
  test(`MIDI opens independently of soundfont and keeps lyrics reachable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    await page.addInitScript(() =>
      localStorage.setItem("gys-media-minimized", "1"),
    );
    await preparePinnedReaderAssets(page);
    await preparePinnedMidiAsset(page);
    let releaseFont!: () => void;
    const fontGate = new Promise<void>((resolve) => {
      releaseFont = resolve;
    });
    await page.route("**/TimGM6mb.sf2", async (route) => {
      await fontGate;
      await route.continue();
    });
    try {
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
      await page
        .getByRole("button", { name: "Tampilkan chord", exact: true })
        .click();
      await expect(page.locator(".chord-rich-line")).toHaveCount(4);
      const sheet = page.locator(".lyrics-sheet");
      const toggle = page.locator(".hymn-midi-toggle");
      await toggle.click();
      const player = page.locator(".media-surface.is-kidung-media");
      // The soundfont is deliberately pending: opening must only need local MIDI.
      await expect(player).toBeVisible({ timeout: 2500 });
      await expect(toggle).toHaveAttribute("aria-busy", "false");
      await expect(toggle).toHaveAttribute(
        "aria-controls",
        "persistent-media-player",
      );
      await expect(page.locator(".hymn-detail-page > .toast")).toHaveCount(0);
      await player
        .getByRole("button", { name: "Perbesar pemutar", exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (await sheet.boundingBox())!.y +
            (await sheet.boundingBox())!.height -
            (await player.boundingBox())!.y,
        )
        .toBeLessThanOrEqual(0);
      const advanced = player.locator(".media-advanced-controls");
      const transpose = player.locator(".media-transpose");
      const key = player.getByRole("combobox", {
        name: "Pilih nada dasar",
        exact: true,
      });
      // PDF metadata can settle while the compact player opens. Read both
      // controls only after the same source key/default transpose is visible.
      await expect(key).toHaveText("D");
      await expect(transpose.locator("strong")).toHaveText("-1");
      const initialTranspose = Number(
        await transpose.locator("strong").innerText(),
      );
      const pitches = [
        "C",
        "C♯",
        "D",
        "D♯",
        "E",
        "F",
        "F♯",
        "G",
        "G♯",
        "A",
        "A♯",
        "B",
      ];
      const initialPitch = pitches.indexOf((await key.innerText()).trim());
      expect(initialPitch).toBeGreaterThanOrEqual(0);
      const sourcePitch = (((initialPitch - initialTranspose) % 12) + 12) % 12;
      await transpose.getByRole("button", { name: "Naikkan nada" }).click();
      const raised = initialTranspose + 1;
      await expect(transpose.locator("strong")).toHaveText(
        raised > 0 ? `+${raised}` : String(raised),
      );
      await key.focus();
      await key.press("End");
      const list = player.locator(".media-key-control [role=listbox]");
      const lastOption = list.getByRole("option").last();
      await expect
        .poll(async () => {
          const visible = (await list.boundingBox())!;
          const option = (await lastOption.boundingBox())!;
          return option.y + option.height - visible.y - visible.height;
        })
        .toBeLessThanOrEqual(2);
      await key.press("Home");
      await key.press("ArrowDown");
      await key.press("ArrowDown");
      await key.press("Enter");
      // Absolute D selection stays relative to the actual source PDF key.
      const selected = ((2 - sourcePitch + 6 + 12) % 12) - 6;
      await expect(key).toHaveText("D");
      await expect(transpose.locator("strong")).toHaveText(
        selected > 0 ? `+${selected}` : String(selected),
      );
      await key.click();
      await key.press("Escape");
      await expect(key).toHaveAttribute("aria-expanded", "false");
      await expect(advanced).not.toHaveAttribute("open", "");
      await player.locator(".media-advanced-summary").click();
      await key.press("Escape");
      await expect(advanced).not.toHaveAttribute("open", "");
      await player.locator(".media-advanced-summary").click();
      await page.locator(".hymn-more-actions-summary").click();
      await expect(advanced).not.toHaveAttribute("open", "");
      await expect(page.locator(".hymn-more-actions")).toHaveAttribute(
        "open",
        "",
      );
      await player.locator(".media-advanced-summary").click();
      await expect(page.locator(".hymn-more-actions")).not.toHaveAttribute(
        "open",
        "",
      );
      const panel = player.locator(".media-advanced-panel");
      for (const control of await panel.locator("button, select").all()) {
        if (!(await control.isVisible())) continue;
        const box = (await control.boundingBox())!;
        expect(Math.round(box.width * 100) / 100).toBeGreaterThanOrEqual(44);
        expect(Math.round(box.height * 100) / 100).toBeGreaterThanOrEqual(44);
      }
      await page.waitForTimeout(300);
      const audit = await new AxeBuilder({ page })
        .include(".media-surface")
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();
      expect(audit.violations).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      await player.locator(".media-advanced-summary").click();
      await player.getByRole("button", { name: "Putar", exact: true }).click();
      await expect(player.getByRole("progressbar")).toBeVisible();
      releaseFont();
      await expect(
        player.getByRole("button", { name: "Jeda", exact: true }),
      ).toBeVisible({ timeout: 30_000 });
      await expect(player.getByRole("progressbar")).toHaveCount(0);
      await toggle.click();
      await expect(player).toHaveCount(0);
      await expect(toggle).not.toHaveAttribute("aria-controls");
      await expect
        .poll(() =>
          page.evaluate(() =>
            document.documentElement.style.getPropertyValue(
              "--reader-media-space",
            ),
          ),
        )
        .toBe("");
    } finally {
      releaseFont();
    }
  });
}
