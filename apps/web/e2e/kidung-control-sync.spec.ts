import { expect, test } from "@playwright/test";
import {
  preparePinnedReaderAssets,
  preparePinnedMidiAsset,
} from "./pinned-reader-fixtures.js";

for (const { width, touch } of [
  { width: 390, touch: true },
  { width: 1440, touch: false },
]) {
  test.describe(`${width}px shared reader controls`, () => {
    test.use({ hasTouch: touch });
    test("reader, dock, fullscreen and PDF keep musical controls synchronized", async ({
      page,
    }) => {
      test.setTimeout(90_000);
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.addInitScript(() =>
        localStorage.setItem("gys-hymn-accidental", "flat"),
      );
      await page.setViewportSize({ width, height: 900 });
      await page.route(/^https:\/\//, (route) => route.abort());
      await preparePinnedReaderAssets(page);
      await preparePinnedMidiAsset(page);
      await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Pujilah Allah",
      );
      const activate = async (selector: string) =>
        touch ? page.locator(selector).tap() : page.locator(selector).click();
      const openReaderMusic = async () => {
        for (const [root, trigger] of [
          [".hymn-more-actions", ".hymn-more-actions-summary"],
          [".hymn-reader-settings", ".hymn-reader-settings-summary"],
          [".hymn-music-settings", ".hymn-music-settings > summary"],
        ]) {
          if ((await page.locator(root!).getAttribute("open")) === null)
            await activate(trigger!);
        }
      };
      await openReaderMusic();
      await expect(page.locator(".hymn-reading-settings")).not.toHaveAttribute(
        "open",
        "",
      );
      const reader = page.locator(".hymn-music-settings");
      await expect(reader.locator(".media-music-controls")).toHaveCount(1);
      await expect(
        reader.getByRole("combobox", { name: "Notasi chord", exact: true }),
      ).toContainText("Flat");
      const instrument = reader.getByRole("combobox", {
        name: "Instrumen MIDI",
        exact: true,
      });
      await instrument.focus();
      await instrument.press("Enter");
      await instrument.press("ArrowDown");
      await instrument.press("Enter");
      await expect(instrument).toBeFocused();
      await expect(instrument).toContainText("Bright Acoustic Piano");
      const readerTempo = reader.getByRole("spinbutton", {
        name: "Tempo MIDI",
        exact: true,
      });
      await readerTempo.fill("114");
      await readerTempo.press("Enter");
      const reset = reader.locator(".media-transpose-reset");
      if (await reset.isEnabled()) await reset.click();
      const up = reader.locator(".media-transpose button").nth(1);
      if (touch) await up.tap();
      else await up.click();
      await expect(reader.locator(".media-transpose strong")).toHaveText("+1");
      await expect(
        reader.getByRole("button", { name: "Naikkan Capo", exact: true }),
      ).toBeVisible();
      expect(
        await reader.evaluate((el) => el.scrollWidth - el.clientWidth),
      ).toBeLessThanOrEqual(1);
      await activate(".hymn-more-actions-summary");
      await activate(".hymn-midi-toggle");
      const dock = page.locator(".media-surface.is-kidung-media");
      await expect(dock).toBeVisible({ timeout: 30_000 });
      await activate(".media-advanced-summary");
      await expect(
        dock.getByRole("combobox", { name: "Instrumen MIDI", exact: true }),
      ).toContainText("Bright Acoustic Piano");
      await expect(dock.locator(".media-transpose strong")).toHaveText("+1");
      const notation = dock.getByRole("button", {
        name: "Ganti notasi kres/mol",
        exact: true,
      });
      await expect(notation).toHaveAttribute("aria-pressed", "true");
      await notation.click();
      await expect(notation).toHaveAttribute("aria-pressed", "false");
      await activate(".media-advanced-summary");
      await openReaderMusic();
      await expect(
        reader.getByRole("combobox", { name: "Notasi chord", exact: true }),
      ).toContainText("Sharp");
      await readerTempo.fill("116");
      await readerTempo.press("Enter");
      await page.screenshot({ path: `/tmp/gys-reader-unified-${width}.png` });
      await activate(".hymn-more-actions-summary");
      await expect(dock.locator(".media-tempo-toggle")).toContainText("116");
      await activate(".hymn-more-actions-summary");
      await activate(".hymn-fullscreen-action");
      const fullscreen = page.locator(".lyrics-panel");
      const toggle = fullscreen.locator(
        ".lyrics-header-actions button[aria-expanded]",
      );
      if ((await toggle.getAttribute("aria-expanded")) === "false")
        await toggle.click();
      await expect(
        fullscreen.getByRole("spinbutton", {
          name: "Tempo MIDI",
          exact: true,
        }),
      ).toHaveValue("116");
      await expect(fullscreen.locator(".media-transpose strong")).toHaveText(
        "+1",
      );
      const key = fullscreen.getByRole("combobox", {
        name: "Pilih nada dasar",
        exact: true,
      });
      await key.click();
      await fullscreen.getByRole("option", { name: "D♯", exact: true }).click();
      await expect(key).toContainText("D♯");
      await page.evaluate(() => {
        localStorage.setItem("gys-hymn-accidental", "flat");
        window.dispatchEvent(
          new StorageEvent("storage", {
            key: "gys-hymn-accidental",
            newValue: "flat",
            storageArea: localStorage,
          }),
        );
      });
      await expect(key).toContainText("E♭");
      await fullscreen
        .getByRole("button", { name: "Tutup lirik", exact: true })
        .click();
      await activate(".hymn-partitur-toggle");
      await expect(page.locator(".pdf-reader")).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.locator(".pdf-accidental-btn")).toHaveAttribute(
        "aria-pressed",
        "true",
      );
      await page.locator(".pdf-music-summary").click();
      if (width <= 767) {
        await expect
          .poll(async () => {
            const menu = (await page
              .locator(".pdf-music-menu-panel")
              .boundingBox())!;
            const player = (await dock.boundingBox())!;
            return menu.y + menu.height - player.y;
          })
          .toBeLessThanOrEqual(1);
      }
      await page.locator(".pdf-accidental-btn").click();
      await expect(page.locator(".pdf-accidental-btn")).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await activate(".media-advanced-summary");
      await expect(notation).toHaveAttribute("aria-pressed", "false");
      await expect(page.locator(".pdf-music-menu")).not.toHaveAttribute(
        "open",
        "",
      );
      expect(errors).toEqual([]);
    });
  });
}

test.describe("PDF music sheet resizing", () => {
  test.use({ hasTouch: true });
  test("music sheet clears the dock through mobile, rail and short landscape layouts", async ({
    page,
  }) => {
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await preparePinnedMidiAsset(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").tap();
    const dock = page.locator(".media-surface.is-kidung-media");
    await expect(dock).toBeVisible({ timeout: 30_000 });
    await page.locator(".hymn-partitur-toggle").tap();
    await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
    await page.locator(".pdf-music-summary").tap();
    const menu = page.locator(".pdf-music-menu-panel");
    for (const viewport of [
      { width: 390, height: 900 },
      { width: 720, height: 900 },
      { width: 720, height: 390 },
      { width: 390, height: 900 },
    ]) {
      await page.setViewportSize(viewport);
      await expect
        .poll(async () => {
          const sheet = (await menu.boundingBox())!;
          const player = (await dock.boundingBox())!;
          return sheet.y + sheet.height - player.y;
        })
        .toBeLessThanOrEqual(-7);
      expect((await menu.boundingBox())!.y).toBeGreaterThanOrEqual(98);
      // A real touch must reach the control even when the sheet scrolls.
      const notation = page.locator(".pdf-accidental-btn");
      const before = await notation.getAttribute("aria-pressed");
      await notation.tap();
      await expect(notation).toHaveAttribute(
        "aria-pressed",
        before === "true" ? "false" : "true",
      );
    }
  });
});

test("held music steppers use fresh values and cancel without a delayed change", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await preparePinnedMidiAsset(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page.locator(".hymn-midi-toggle").click();
  const dock = page.locator(".media-surface.is-kidung-media");
  await expect(dock).toBeVisible({ timeout: 30_000 });
  await dock.locator(".media-advanced-summary").click();
  const reset = dock.locator(".media-transpose-reset");
  if (await reset.isEnabled()) await reset.click();
  const up = dock.locator(".media-transpose button").nth(1);
  const box = (await up.boundingBox())!;
  const session = await page.context().newCDPSession(page);
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...point, id: 1 }],
  });
  await expect
    .poll(async () =>
      Number(await dock.locator(".media-transpose strong").textContent()),
    )
    .toBeGreaterThanOrEqual(3);
  await session.send("Input.dispatchTouchEvent", {
    type: "touchCancel",
    touchPoints: [],
  });
  const cancelledAt = await dock
    .locator(".media-transpose strong")
    .textContent();
  await page.waitForTimeout(550);
  await expect(dock.locator(".media-transpose strong")).toHaveText(
    cancelledAt!,
  );
  await up.focus();
  await up.press("Enter");
  await expect(dock.locator(".media-transpose strong")).toHaveText(
    `+${Number(cancelledAt) + 1}`,
  );
});

test("fullscreen preserves the unloaded reader's PDF pitch and capo chord shapes", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(
    page.locator(".lyrics-sheet .chord-visual-marker").first(),
  ).toHaveText("D", { timeout: 30_000 });
  await page.locator(".hymn-more-actions-summary").click();
  await page.locator(".hymn-reader-settings-summary").click();
  await page.locator(".hymn-music-settings > summary").click();
  const reader = page.locator(".hymn-music-settings");
  await expect(reader.locator(".media-transpose strong")).toHaveText("-1");
  await reader
    .getByRole("button", { name: "Naikkan Capo", exact: true })
    .click();
  await expect(
    page.locator(".lyrics-sheet .chord-visual-marker").first(),
  ).toHaveText("C♯");
  const shapes = await page
    .locator(".lyrics-sheet .chord-visual-marker")
    .allTextContents();
  await page.locator(".hymn-more-actions-summary").click();
  await page.locator(".hymn-more-actions-summary").click();
  await page.locator(".hymn-fullscreen-action").click();
  const fullscreen = page.locator(".lyrics-panel");
  const toggle = fullscreen.locator(
    ".lyrics-header-actions button[aria-expanded]",
  );
  if ((await toggle.getAttribute("aria-expanded")) === "false")
    await toggle.click();
  await expect(fullscreen.locator(".media-transpose strong")).toHaveText("-1");
  await expect(
    fullscreen.getByRole("combobox", { name: "Pilih nada dasar", exact: true }),
  ).toContainText("D");
  await expect
    .poll(() => fullscreen.locator(".chord-visual-marker").allTextContents())
    .toEqual(shapes);
  await fullscreen.locator(".media-transpose-reset").click();
  await fullscreen
    .getByRole("button", { name: "Tutup lirik", exact: true })
    .click();
  await page.locator(".hymn-more-actions-summary").click();
  await page.locator(".hymn-reader-settings-summary").click();
  if ((await reader.getAttribute("open")) === null)
    await reader.locator("summary").click();
  await expect(reader.locator(".media-transpose strong")).toHaveText("0");
  await expect(reader.locator(".capo-btn-group strong")).toHaveText("1");
});
