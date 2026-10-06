import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

test("score/text changes preserve chords and reuse the master PDF worker and requests", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  await page.addInitScript(() => {
    const host = window as Window & { pdfWorkerCount: number };
    host.pdfWorkerCount = 0;
    window.Worker = new Proxy(window.Worker, {
      construct(target, args) {
        if (String(args[0]).includes("pdf.worker")) host.pdfWorkerCount++;
        return Reflect.construct(target, args);
      },
    });
  });
  const masterRequests: string[] = [],
    perSongRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("kr_master.pdf"))
      masterRequests.push(request.url());
    if (/\/docs\/.*\.pdf/.test(request.url()))
      perSongRequests.push(request.url());
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
  await page
    .getByRole("button", { name: "Tampilkan chord", exact: true })
    .click();
  await expect(page.locator(".chord-rich-line")).toHaveCount(4);
  await page.getByRole("button", { name: "Partitur", exact: true }).click();
  const canvas = page
    .locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]')
    .first();
  await expect(canvas).toBeVisible({ timeout: 20_000 });
  const openedRequests = masterRequests.length;
  await page.locator(".hymn-pdf-text-toggle").click();
  await expect(page.locator(".chord-rich-line")).toHaveCount(4);
  await expect(
    page.getByRole("button", { name: "Sembunyikan chord", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Partitur", exact: true }).click();
  await expect(canvas).toBeVisible();
  await page
    .locator(".pdf-reader-hymn")
    .getByRole("button", { name: "Berikutnya", exact: true })
    .click();
  await expect(page).toHaveURL(/hymn-002\?mode=pdf/);
  await expect(canvas).toBeVisible();
  expect(masterRequests.length).toBe(openedRequests);
  expect(perSongRequests).toEqual([]);
  expect(
    await page.evaluate(
      () => (window as Window & { pdfWorkerCount: number }).pdfWorkerCount,
    ),
  ).toBe(1);
});

for (const width of [320, 390, 768, 1440]) {
  test(`immersive score controls remain centered and accessible at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=pdf");
    await expect(
      page.locator('.pdf-reader-hymn canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible({ timeout: 20_000 });
    const header = page.locator(".hymn-pdf-viewer-chrome");
    expect((await header.boundingBox())!.height).toBeLessThanOrEqual(64);
    await expect(header.locator("button:visible")).toHaveCount(2);
    for (const button of await page
      .locator(".gys-pdf-overlay")
      .locator("button:visible, summary:visible")
      .all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      const svg = button.locator("svg").first();
      if (await svg.count()) {
        const icon = (await svg.boundingBox())!;
        expect(
          Math.abs(icon.x + icon.width / 2 - box.x - box.width / 2),
        ).toBeLessThanOrEqual(2);
        expect(
          Math.abs(icon.y + icon.height / 2 - box.y - box.height / 2),
        ).toBeLessThanOrEqual(2);
      }
    }
    await page.locator(".pdf-advanced-toggle").click();
    for (const theme of ["light", "dark"]) {
      await page.evaluate(
        (theme) => (document.documentElement.dataset.theme = theme),
        theme,
      );
      const audit = await new AxeBuilder({ page })
        .include(".gys-pdf-overlay")
        .analyze();
      expect(audit.violations).toEqual([]);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.keyboard.press("Escape");
    await expect(page.locator(".pdf-advanced-controls")).toBeHidden();
  });
}

test("late score metadata updates the MIDI key while preserving a manual transpose", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await preparePinnedReaderAssets(page);
  const { preparePinnedMidiAsset } =
    await import("./pinned-reader-fixtures.js");
  await preparePinnedMidiAsset(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/kr_master.pdf", async (route) => {
    await gate;
    await route.fallback();
  });
  await page.route("**/TimGM6mb.sf2", async (route) => {
    await gate;
    await route.continue();
  });
  try {
    await page.goto("/GYSApp-Tauri/kidung/hymn-001?mode=lyrics");
    await page.locator(".hymn-midi-toggle").click();
    const player = page.locator(".media-surface");
    await player
      .getByRole("button", { name: "Perbesar pemutar", exact: true })
      .click();
    await player.locator(".media-advanced-summary").click();
    const transpose = player.locator(".media-transpose");
    await transpose.getByRole("button", { name: "Naikkan nada" }).click();
    await transpose.getByRole("button", { name: "Naikkan nada" }).click();
    await expect(transpose.locator("strong")).toHaveText("+2");
    release();
    // The actual mapped first page is in E-flat (3); +2 therefore displays F (5).
    await expect(
      player.getByRole("combobox", { name: "Pilih nada dasar", exact: true }),
    ).toHaveText("F");
    await expect(transpose.locator("strong")).toHaveText("+2");
    await page.locator(".hymn-midi-toggle").click();
  } finally {
    release();
  }
});
