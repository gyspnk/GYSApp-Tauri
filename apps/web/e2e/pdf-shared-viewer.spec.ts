import { expect, test, type Page } from "@playwright/test";
import { documentBytes } from "./pdf-fixtures.js";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

async function openSharedReader(page: Page, kind: "faith" | "literature") {
  await page.route(/^https:\/\//, (route) => route.abort());
  if (kind === "faith") {
    await page.goto("/GYSApp-Tauri/iman");
    await page.locator('button[aria-label*="PDF"]').first().click();
  } else {
    await page.route("**/offline/literature.json", (route) =>
      route.fulfill({
        json: {
          source: "tjc.org",
          generatedAt: "2026-10-06T00:00:00Z",
          items: [
            {
              id: "shared-pdf",
              category: "buku",
              title: "Literatur PDF",
              description: "",
              url: "https://tjc.org/id/shared-viewer.pdf",
              format: "pdf",
              publishedAt: "2026-10-01T00:00:00Z",
              updatedAt: "2026-10-01T00:00:00Z",
              source: "tjc.org",
            },
          ],
        },
      }),
    );
    await page.route("**/api/v1/content/pdf?**", (route) =>
      route.fulfill({
        body: documentBytes(4),
        contentType: "application/pdf",
        headers: { "access-control-allow-origin": "*" },
      }),
    );
    await page.goto("/GYSApp-Tauri/literatur/shared-pdf?read=1");
  }
  const reader = page.locator(".pdf-reader");
  await expect(
    reader.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible({ timeout: 15_000 });
  return reader;
}

for (const width of [390, 768, 1440])
  for (const kind of ["faith", "literature"] as const) {
    test(`${kind} shares centered fit, smooth wheel, pinch and sharp zoom at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 760 });
      const failures: string[] = [];
      page.on("pageerror", (error) => failures.push(error.message));
      const reader = await openSharedReader(page, kind);
      const stage = reader.locator(".pdf-stage");
      const canvas = reader.locator(".pdf-page-frame > canvas").first();
      await expect
        .poll(() =>
          stage.evaluate((element) => {
            const paper = element
              .querySelector(".pdf-page-frame > canvas")!
              .getBoundingClientRect();
            const box = element.getBoundingClientRect(),
              style = getComputedStyle(element);
            return Math.max(
              Math.abs(
                paper.x + paper.width / 2 - box.x - element.clientWidth / 2,
              ),
              Math.abs(
                paper.y + paper.height / 2 - box.y - element.clientHeight / 2,
              ),
              Math.min(
                Math.abs(
                  paper.width -
                    element.clientWidth +
                    parseFloat(style.paddingLeft) +
                    parseFloat(style.paddingRight),
                ),
                Math.abs(
                  paper.height -
                    element.clientHeight +
                    parseFloat(style.paddingTop) +
                    parseFloat(style.paddingBottom),
                ),
              ),
            );
          }),
        )
        .toBeLessThanOrEqual(1);
      const initial = (await canvas.boundingBox())!.width;
      const widths = await stage.evaluate(
        (element) =>
          new Promise<number[]>((resolve) => {
            const paper = element.querySelector(".pdf-page-frame > canvas")!,
              box = paper.getBoundingClientRect();
            element.dispatchEvent(
              new WheelEvent("wheel", {
                deltaY: -300,
                ctrlKey: true,
                clientX: box.x + box.width / 2,
                clientY: box.y + box.height / 2,
                cancelable: true,
                bubbles: true,
              }),
            );
            const widths: number[] = [],
              start = performance.now();
            const sample = () => {
              widths.push(paper.getBoundingClientRect().width);
              if (performance.now() - start < 240)
                requestAnimationFrame(sample);
              else resolve(widths);
            };
            requestAnimationFrame(sample);
          }),
      );
      expect(
        widths.some((value) => value > initial * 1.05 && value < initial * 1.7),
      ).toBe(true);
      await expect(reader.locator(".pdf-zoom-indicator")).toHaveText("182%");
      await stage.focus();
      await page.keyboard.press("Control+0");
      await expect
        .poll(async () => (await canvas.boundingBox())!.width / initial)
        .toBeCloseTo(1, 2);
      await stage.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const touches = (distance: number) =>
          [-1, 1].map(
            (side, identifier) =>
              new Touch({
                identifier,
                target: element,
                clientX: box.x + box.width / 2 + (side * distance) / 2,
                clientY: box.y + box.height / 2,
              }),
          );
        element.dispatchEvent(
          new TouchEvent("touchstart", {
            touches: touches(100),
            cancelable: true,
            bubbles: true,
          }),
        );
        element.dispatchEvent(
          new TouchEvent("touchmove", {
            touches: touches(200),
            cancelable: true,
            bubbles: true,
          }),
        );
        element.dispatchEvent(
          new TouchEvent("touchend", { touches: [], bubbles: true }),
        );
      });
      await expect(reader.locator(".pdf-zoom-indicator")).toHaveText("200%");
      await expect
        .poll(async () => (await canvas.boundingBox())!.width / initial)
        .toBeCloseTo(2, 2);
      await stage.evaluate((element) =>
        element.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: -1500,
            ctrlKey: true,
            clientX: innerWidth / 2,
            clientY: innerHeight / 2,
            bubbles: true,
            cancelable: true,
          }),
        ),
      );
      await expect(reader.locator(".pdf-zoom-indicator")).toHaveText("800%");
      await expect(
        reader.locator("canvas[data-pdf-detail]").first(),
      ).toBeVisible();
      await stage.focus();
      await page.keyboard.press("Control+0");
      await expect(reader.locator("canvas[data-pdf-detail]")).toHaveCount(0);
      expect(await page.evaluate(() => visualViewport!.scale)).toBe(1);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      expect(failures).toEqual([]);
    });
  }

for (const width of [320, 390, 768, 1440]) {
  test(`two-page score exposes both song and PDF navigation at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 760 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-133?mode=pdf");
    const reader = page.locator(".pdf-reader-hymn"),
      toolbar = reader.locator(".pdf-toolbar");
    await expect(
      reader.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible({ timeout: 20_000 });
    await expect(reader.locator(".pdf-advanced-controls")).toBeHidden();
    await expect(reader.locator(".pdf-page-jump input")).toHaveAttribute(
      "max",
      "2",
    );
    for (const button of await toolbar.locator("button:visible").all()) {
      const box = (await button.boundingBox())!;
      expect(box.width).toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
    }
    await expect(
      reader.getByRole("button", { name: "Pujian sebelumnya", exact: true }),
    ).toBeVisible();
    await expect(
      reader.getByRole("button", { name: "Pujian berikutnya", exact: true }),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: "Berikutnya", exact: true })
      .click();
    await expect(reader.locator(".pdf-page-jump input")).toHaveValue("2");
    await expect(
      reader.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: "Pujian berikutnya", exact: true })
      .click();
    await expect(page).toHaveURL(/kidung\/hymn-134/);
    await expect(
      reader.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible();
    await reader
      .getByRole("button", { name: "Pujian sebelumnya", exact: true })
      .click();
    await expect(page).toHaveURL(/kidung\/hymn-133/);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  });
}
