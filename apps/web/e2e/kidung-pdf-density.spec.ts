import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("single-page hymn PDF hides unavailable pager buttons", async ({
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
      attributeFilter: ["class", "data-pdf-rendered", "height", "style", "width"],
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
  const renderedPage = reader.locator('canvas[data-pdf-rendered="true"]').first();
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
    const state = (window as unknown as {
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
    }).__gysPdfReadiness;
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
  await expect(
    reader.locator(".pdf-pages canvas").first(),
  ).toHaveAttribute("data-pdf-rendered", "true", { timeout: 30_000 });
});
