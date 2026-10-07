import AxeBuilder from "@axe-core/playwright";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";
import { expect, test, type Page } from "@playwright/test";

import { documentBytes } from "./pdf-fixtures.js";

async function openReader(page: Page) {
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-10-01T00:00:00Z",
        items: [
          {
            id: "pdf-efficient",
            category: "buku",
            title: "Buku Nyanyian",
            description: "",
            url: "http://127.0.0.1:4173/GYSApp-Tauri/reader-test.pdf",
            format: "pdf",
            publishedAt: "2026-09-01T00:00:00Z",
            updatedAt: "2026-09-01T00:00:00Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/reader-test.pdf", (route) =>
    route.fulfill({ body: documentBytes(), contentType: "application/pdf" }),
  );
  await page.goto("/GYSApp-Tauri/literatur/pdf-efficient?read=1");
  const reader = page.locator(".pdf-reader");
  await expect(
    reader.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  return reader;
}

for (const width of [320, 360, 390, 768, 1440]) {
  test(`PDF controls stay compact and usable at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const reader = await openReader(page);
    const toolbar = reader.locator(".pdf-toolbar");
    expect((await toolbar.boundingBox())!.height).toBeLessThanOrEqual(110);
    await expect(reader.locator(".pdf-advanced-controls")).toBeHidden();
    await reader.locator(".pdf-advanced-toggle").click();
    const buttons = reader.locator(".pdf-toolbar button:visible");
    for (const button of await buttons.all()) {
      // The release animation briefly scales the clicked control below 44px.
      await expect
        .poll(async () => (await button.boundingBox())?.width ?? 0)
        .toBeGreaterThanOrEqual(43.99);
      await expect
        .poll(async () => (await button.boundingBox())?.height ?? 0)
        .toBeGreaterThanOrEqual(43.99);
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(43.99);
      expect(box.height).toBeGreaterThanOrEqual(43.99);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}

test("PDF commits page input once, fits spreads, resizes, and bounds rapid zoom", async ({
  page,
}) => {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(error.message));
  await page.setViewportSize({ width: 1440, height: 900 });
  const reader = await openReader(page);
  const jump = reader.locator(".pdf-page-jump input");
  await jump.fill("12");
  await expect(reader.locator(".pdf-page-navigation > span")).toHaveText(
    "Halaman 1 / 48",
  );
  await jump.press("Enter");
  await expect(reader.locator(".pdf-page-navigation > span")).toHaveText(
    "Halaman 12 / 48",
  );
  await jump.fill("99");
  await jump.press("Escape");
  await expect(jump).toHaveValue("12");
  await reader.locator(".pdf-advanced-toggle").click();
  await reader.getByRole("button", { name: "Tampilan 2 halaman" }).click();
  const canvases = reader.locator('canvas[data-pdf-rendered="true"]');
  await expect(canvases).toHaveCount(2);
  const stage = reader.locator(".pdf-stage");
  expect(
    await stage.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBeLessThanOrEqual(2);
  const before = (await canvases.first().boundingBox())!.width;
  await page.setViewportSize({ width: 1000, height: 700 });
  await expect
    .poll(async () => (await canvases.first().boundingBox())!.width)
    .toBeLessThan(before);
  await stage.focus();
  await page.keyboard.press("Control+=");
  await page.keyboard.press("Control+=");
  await page.keyboard.press("Control+=");
  await expect(reader.locator(".pdf-zoom-indicator")).toHaveText("175%");
  await page.keyboard.press("Control+0");
  await expect(reader.locator(".pdf-zoom-indicator")).toHaveText("100%");
  for (let index = 0; index < 28; index++)
    await reader.getByRole("button", { name: "Perbesar PDF" }).click();
  await expect(reader.locator(".pdf-zoom-indicator")).toHaveText("800%");
  await expect.poll(() => reader.locator(".pdf-loading").count()).toBe(0);
  for (const canvas of await canvases.all()) {
    const dimensions = await canvas.evaluate((element: HTMLCanvasElement) => [
      element.width,
      element.height,
    ]);
    expect(dimensions[0]! * dimensions[1]!).toBeLessThanOrEqual(4_000_000);
  }
  await reader.getByRole("button", { name: "Reset zoom PDF" }).click();
  await expect(reader.locator(".pdf-loading")).toHaveCount(0);
  await expect(canvases).toHaveCount(2);
  expect(failures).toEqual([]);
});

test("long PDF renders only nearby pages and releases offscreen bitmap memory", async ({
  page,
}) => {
  const reader = await openReader(page);
  await reader.locator(".pdf-advanced-toggle").click();
  await reader.getByRole("button", { name: "Vertikal" }).click();
  await expect(reader.locator(".pdf-vertical-page")).toHaveCount(48);
  await expect(reader.locator('[data-pdf-page="1"] canvas')).toHaveAttribute(
    "data-pdf-rendered",
    "true",
  );
  await expect
    .poll(() => reader.locator('canvas[data-pdf-rendered="true"]').count())
    .toBeLessThanOrEqual(5);
  await expect(reader.locator('[data-pdf-page="30"] canvas')).toHaveAttribute(
    "data-pdf-rendered",
    "false",
  );
  const jump = reader.locator(".pdf-page-jump input");
  await jump.fill("30");
  await jump.press("Enter");
  await expect(reader.locator('[data-pdf-page="30"] canvas')).toHaveAttribute(
    "data-pdf-rendered",
    "true",
    { timeout: 15_000 },
  );
  await expect
    .poll(() =>
      reader
        .locator('[data-pdf-page="1"] canvas')
        .evaluate((element: HTMLCanvasElement) => element.width),
    )
    .toBe(0);
  await expect
    .poll(() => reader.locator('canvas[data-pdf-rendered="true"]').count())
    .toBeLessThanOrEqual(5);
  // Bitmap readiness precedes completion of the smooth jump. Wait for the
  // viewport to reach that page before testing a separate manual scroll.
  await expect
    .poll(() =>
      reader.locator(".pdf-stage").evaluate((stage) => {
        const bounds = stage.getBoundingClientRect();
        return document
          .elementFromPoint(
            bounds.left + bounds.width / 2,
            bounds.top + bounds.height / 2,
          )
          ?.closest<HTMLElement>("[data-pdf-page]")?.dataset.pdfPage;
      }),
    )
    .toBe("30");
  await reader
    .locator('[data-pdf-page="20"]')
    .evaluate((element) =>
      element.scrollIntoView({ behavior: "instant", block: "start" }),
    );
  await expect(reader.locator(".pdf-page-navigation > span")).toHaveText(
    "Halaman 20 / 48",
  );
});

test("PDF motion respects reduced-motion preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reader = await openReader(page);
  await reader.locator(".pdf-advanced-toggle").click();
  expect(
    await reader
      .locator(".pdf-advanced-controls")
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  expect(
    await reader
      .locator('canvas[data-pdf-rendered="true"]')
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});

test("PDF options keep keyboard focus and accessible names", async ({
  page,
}) => {
  const reader = await openReader(page);
  const toggle = reader.locator(".pdf-advanced-toggle");
  await toggle.click();
  const audit = await new AxeBuilder({ page }).include(".pdf-reader").analyze();
  expect(audit.violations).toEqual([]);
  await reader.getByRole("button", { name: "Perbesar PDF" }).focus();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
  await expect(reader.locator(".pdf-advanced-controls")).toBeHidden();
  await expect(reader).toBeVisible();
  await toggle.click();
  await reader
    .getByRole("button", { name: "Layar penuh", exact: true })
    .click();
  await expect
    .poll(() =>
      reader.evaluate((element) => document.fullscreenElement === element),
    )
    .toBe(true);
  await reader.getByRole("button", { name: "Keluar layar penuh" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);
  const download = page.waitForEvent("download");
  await reader.locator(".pdf-download").click();
  expect((await download).suggestedFilename()).toBe("Buku Nyanyian.pdf");
});

test("hymn PDF page entry stays relative to its master-document window", async ({
  page,
}) => {
  await preparePinnedReaderAssets(page);
  await page.goto("/GYSApp-Tauri/kidung/hymn-133");
  await expect(page.locator(".lyrics-sheet")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Partitur", exact: true }).click();
  const reader = page.locator(".pdf-reader-hymn");
  await expect(
    reader.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 20_000 });
  const jump = reader.locator(".pdf-page-jump input");
  await expect(jump).toHaveAttribute("min", "1");
  await expect(jump).toHaveAttribute("max", "2");
  await jump.fill("2");
  await jump.press("Enter");
  await expect(reader.locator(".pdf-page-navigation > span")).toHaveText(
    "Halaman 2 / 2",
  );
  await expect(jump).toHaveValue("2");
});
