import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ hasTouch: true, serviceWorkers: "block" });

test("hymn PDF supports layout, orientation, and zoom controls", async ({
  page,
}) => {
  test.setTimeout(75_000);
  await page.addInitScript(() => {
    type PdfReadinessSample = {
      loading: boolean;
      rendered: string | null;
      width: number;
      height: number;
      styleWidth: string;
      styleHeight: string;
    };
    const samples: PdfReadinessSample[] = [];
    const record = () => {
      const stage = document.querySelector<HTMLElement>(".pdf-stage");
      const canvas = stage?.querySelector<HTMLCanvasElement>(
        'canvas[data-pdf-rendered="true"]',
      );
      if (!stage || !canvas) return;
      const next: PdfReadinessSample = {
        loading: Boolean(stage.querySelector(".pdf-loading")),
        rendered: canvas.dataset.pdfRendered ?? null,
        width: canvas.width,
        height: canvas.height,
        styleWidth: canvas.style.width,
        styleHeight: canvas.style.height,
      };
      const previous = samples.at(-1);
      if (JSON.stringify(previous) !== JSON.stringify(next)) samples.push(next);
    };
    const observer = new MutationObserver(record);
    observer.observe(document, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [
        "class",
        "data-pdf-rendered",
        "height",
        "style",
        "width",
      ],
    });
    (window as unknown as { __gysPdfReadiness?: unknown }).__gysPdfReadiness = {
      samples,
      record,
      stop: () => observer.disconnect(),
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });

  await page.getByRole("tab", { name: "PDF" }).click();
  const reader = page.locator(".pdf-reader-hymn");
  await expect(reader).toBeVisible({ timeout: 30_000 });
  const renderedPage = reader
    .locator('canvas[data-pdf-rendered="true"]')
    .first();
  await expect(renderedPage).toBeVisible({ timeout: 30_000 });
  await expect
    .poll(
      () =>
        renderedPage.evaluate((canvas) => {
          const pageCanvas = canvas as HTMLCanvasElement;
          return pageCanvas.width > 0 && pageCanvas.height > 0;
        }),
      { timeout: 30_000 },
    )
    .toBe(true);
  await expect(renderedPage).toHaveAttribute("data-pdf-rendered", "true");
  const readinessSamples = await page.evaluate(() => {
    const state = (
      window as unknown as {
        __gysPdfReadiness?: {
          samples: Array<{
            rendered: string | null;
            width: number;
            height: number;
            styleWidth: string;
            styleHeight: string;
          }>;
          record: () => void;
          stop: () => void;
        };
      }
    ).__gysPdfReadiness;
    state?.record();
    state?.stop();
    return state?.samples ?? [];
  });
  expect(readinessSamples.some((sample) => sample.rendered === "true")).toBe(
    true,
  );
  expect(
    readinessSamples
      .filter((sample) => sample.rendered === "true")
      .every(
        (sample) =>
          sample.width > 0 &&
          sample.height > 0 &&
          sample.styleWidth.length > 0 &&
          sample.styleHeight.length > 0,
      ),
  ).toBe(true);
  await expect(reader.locator(".pdf-loading")).toHaveCount(0);
  await expect(page.locator(".gys-pdf-overlay > .loading-panel")).toHaveCount(
    0,
  );

  const unavailablePager = reader.locator(
    ".pdf-page-navigation > button:disabled",
  );
  const unavailablePagerCount = await unavailablePager.count();
  expect(unavailablePagerCount).toBe(2);
  for (let index = 0; index < unavailablePagerCount; index += 1) {
    await expect(unavailablePager.nth(index)).toBeHidden();
  }

  const options = page.getByRole("button", { name: "Opsi PDF" });
  await options.click();
  await reader.getByRole("button", { name: "Vertikal" }).click();
  await expect(reader.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "vertical",
  );
  const verticalPage = reader.locator(".pdf-pages canvas").first();
  await expect(verticalPage).toHaveAttribute("data-pdf-rendered", "true", {
    timeout: 30_000,
  });
  await reader.getByRole("button", { name: "Mendatar" }).click();
  await expect(reader.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "horizontal",
  );
  await expect(reader.locator(".pdf-pages canvas").first()).toHaveAttribute(
    "data-pdf-rendered",
    "true",
    { timeout: 30_000 },
  );

  await page.setViewportSize({ width: 768, height: 1024 });
  await reader.getByRole("button", { name: "Tampilan 2 halaman" }).click();
  await expect(reader.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "two",
  );
  await expect(reader.locator(".pdf-orientation-warning")).toBeVisible();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(reader.locator(".pdf-orientation-warning")).toHaveCount(0);
  await reader.getByRole("button", { name: "Tampilan 1 halaman" }).click();
  await expect(reader.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "single",
  );

  const zoom = reader.locator(".pdf-zoom-indicator");
  const zoomIn = reader.getByRole("button", { name: "Perbesar PDF" });
  for (let step = 0; step < 28; step += 1) await zoomIn.click();
  await expect(zoom).toHaveText("800%");
  await expect(zoomIn).toBeDisabled();
  await reader.getByRole("button", { name: "Reset zoom PDF" }).click();
  await expect(zoom).toHaveText("100%");

  await reader.locator(".pdf-stage").dispatchEvent("wheel", {
    deltaY: -120,
    ctrlKey: true,
  });
  await expect(zoom).toHaveText("125%");
  await zoom.dblclick();
  await expect(zoom).toHaveText("100%");

  const stage = reader.locator(".pdf-stage");
  await stage.evaluate((element) => {
    const target = element as HTMLElement;
    const makeTouch = (identifier: number, x: number, y: number) =>
      new Touch({
        identifier,
        target,
        clientX: x,
        clientY: y,
      });
    const send = (type: string, touches: Touch[], changedTouches: Touch[]) =>
      target.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches,
          changedTouches,
        }),
      );

    const first = makeTouch(1, 100, 100);
    const second = makeTouch(2, 200, 100);
    const zoomedSecond = makeTouch(2, 300, 100);
    send("touchstart", [first, second], [first, second]);
    send("touchmove", [first, zoomedSecond], [zoomedSecond]);
    send("touchend", [], [first, zoomedSecond]);
  });
  await expect(zoom).toHaveText("200%");

  const stageBounds = await stage.boundingBox();
  expect(stageBounds).not.toBeNull();
  const stageX = stageBounds!.x + stageBounds!.width / 2;
  const stageY = stageBounds!.y + stageBounds!.height / 2;
  await page.touchscreen.tap(stageX, stageY);
  await page.touchscreen.tap(stageX, stageY);
  await expect(zoom).toHaveText("100%");
  await page.touchscreen.tap(stageX, stageY);
  await page.touchscreen.tap(stageX, stageY);
  await expect(zoom).toHaveText("180%");
});

test("hymn PDF toolbar collapses after idle and returns on reader input", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "PDF" }).click();
  const reader = page.locator(".pdf-reader-hymn");
  await expect(
    reader.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 30_000 });

  const toolbar = reader.locator(".pdf-toolbar");
  await expect(toolbar).not.toHaveClass(/is-collapsed/);
  await page.waitForTimeout(3_200);
  await expect(toolbar).toHaveClass(/is-collapsed/);

  await reader.locator(".pdf-stage").click({ position: { x: 24, y: 24 } });
  await expect(toolbar).not.toHaveClass(/is-collapsed/);
});

test("hymn PDF enters fullscreen and downloads the current PDF asset", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: "Pujilah Allah Yang Maha Esa" }),
  ).toBeVisible({ timeout: 20_000 });
  await page.getByRole("tab", { name: "PDF" }).click();
  const reader = page.locator(".pdf-reader-hymn");
  const stage = reader.locator(".pdf-stage");
  await expect(
    reader.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 30_000 });

  await reader.getByRole("button", { name: "Layar penuh" }).click();
  await expect
    .poll(() =>
      reader.evaluate((element) => document.fullscreenElement === element),
    )
    .toBe(true);
  const fullscreenBounds = await reader.boundingBox();
  expect(fullscreenBounds).not.toBeNull();
  expect(fullscreenBounds!.x).toBe(0);
  expect(fullscreenBounds!.y).toBe(0);
  expect(fullscreenBounds!.width).toBe(1024);
  expect(fullscreenBounds!.height).toBe(768);
  await reader.getByRole("button", { name: "Keluar layar penuh" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement === null))
    .toBe(true);

  await stage.click({ position: { x: 24, y: 24 } });
  const advancedToggle = reader.locator(".pdf-advanced-toggle");
  if (
    (await advancedToggle.isVisible()) &&
    (await advancedToggle.getAttribute("aria-expanded")) !== "true"
  ) {
    await advancedToggle.click();
  }
  const downloadLink = reader.locator(".pdf-download");
  await expect(downloadLink).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await downloadLink.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("Pujilah Allah Yang Maha Esa.pdf");
  const path = await download.path();
  expect(path).toBeTruthy();
  expect((await readFile(path!)).subarray(0, 4).toString()).toBe("%PDF");
});
