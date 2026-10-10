import { expect, test, type Page } from "@playwright/test";
import { documentBytes } from "./pdf-fixtures.js";
import { preparePinnedReaderAssets } from "./pinned-reader-fixtures.js";

async function openBook(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-10-08T00:00:00Z",
        items: [
          {
            id: "layout-book",
            category: "buku",
            title: "Buku PDF",
            description: "",
            url: "http://127.0.0.1:4173/GYSApp-Tauri/layout-book.pdf",
            format: "pdf",
            publishedAt: "2026-10-01T00:00:00Z",
            updatedAt: "2026-10-01T00:00:00Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/layout-book.pdf", (route) =>
    route.fulfill({ body: documentBytes(6), contentType: "application/pdf" }),
  );
  await page.goto("/GYSApp-Tauri/literatur/layout-book?read=1");
  const reader = page.locator(".pdf-reader");
  await expect(
    reader.locator('canvas[data-pdf-rendered="true"]').first(),
  ).toBeVisible();
  return reader;
}

test("even pages join their original spread, including the final batch", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const reader = await openBook(page),
    jump = reader.locator(".pdf-page-jump input");
  await jump.fill("2");
  await jump.press("Enter");
  await reader.locator(".pdf-advanced-toggle").click();
  await reader
    .getByRole("button", { name: "Tampilan 2 halaman", exact: true })
    .click();
  const pages = () =>
    reader
      .locator('canvas[data-pdf-rendered="true"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => (n as HTMLElement).dataset.pdfPageNumber),
      );
  await expect.poll(pages).toEqual(["1", "2"]);
  await reader.getByRole("button", { name: "Berikutnya", exact: true }).click();
  await expect.poll(pages).toEqual(["3", "4"]);
  await jump.fill("6");
  await jump.press("Enter");
  await expect.poll(pages).toEqual(["5", "6"]);
  await expect(jump).toHaveValue("5");
  await expect(
    reader.getByRole("button", { name: "Berikutnya", exact: true }),
  ).toBeDisabled();
  await page.setViewportSize({ width: 390, height: 800 });
  await expect(reader.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "single",
  );
  await expect(
    reader.getByRole("button", { name: "Tampilan 2 halaman", exact: true }),
  ).toBeDisabled();
  await expect(
    reader.getByRole("button", { name: "Tampilan 1 halaman", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 1440, height: 900 });
  await expect.poll(pages).toEqual(["5", "6"]);
  await page.setViewportSize({ width: 768, height: 1024 });
  await expect(reader.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "two",
  );
  await expect(reader.locator(".pdf-orientation-warning")).toHaveCount(0);
  await page.reload();
  await expect.poll(pages).toEqual(["5", "6"]);
});

for (const width of [390, 1440])
  test(`horizontal pages fit, keep stable slots and respond to the wheel at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    const reader = await openBook(page);
    await reader.locator(".pdf-advanced-toggle").click();
    await reader.getByRole("button", { name: "Mendatar", exact: true }).click();
    const stage = reader.locator(".pdf-stage");
    await expect(reader.locator('[data-pdf-page="1"] canvas')).toHaveAttribute(
      "data-pdf-rendered",
      "true",
    );
    await expect
      .poll(() => stage.evaluate((s) => s.scrollHeight - s.clientHeight))
      .toBeLessThanOrEqual(2);
    const slot = await reader.locator('[data-pdf-page="1"]').boundingBox();
    await stage.evaluate(
      (s, distance) =>
        s.dispatchEvent(
          new WheelEvent("wheel", {
            deltaY: distance,
            cancelable: true,
            bubbles: true,
          }),
        ),
      slot!.width + 18,
    );
    await expect(reader.locator(".pdf-page-jump input")).toHaveValue("2");
    const beforePan = await stage.evaluate((s) => s.scrollLeft);
    await stage.evaluate((s) => {
      const box = s.getBoundingClientRect();
      const finger = (x: number) =>
        new Touch({
          identifier: 1,
          target: s,
          clientX: x,
          clientY: box.top + 100,
        });
      s.dispatchEvent(
        new TouchEvent("touchstart", {
          touches: [finger(box.left + 200)],
          bubbles: true,
          cancelable: true,
        }),
      );
      s.dispatchEvent(
        new TouchEvent("touchmove", {
          touches: [finger(box.left + 100)],
          bubbles: true,
          cancelable: true,
        }),
      );
      s.dispatchEvent(
        new TouchEvent("touchend", { touches: [], bubbles: true }),
      );
    });
    await expect
      .poll(() => stage.evaluate((s) => s.scrollLeft))
      .toBeGreaterThan(beforePan + 90);
    const box = (await stage.boundingBox())!;
    await page.mouse.move(box.x + 200, box.y + 100);
    await page.mouse.down();
    await page.mouse.move(box.x + 100, box.y + 100, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(() => stage.evaluate((s) => s.scrollLeft))
      .toBeGreaterThan(beforePan + 180);
    const jump = reader.locator(".pdf-page-jump input");
    await jump.fill("6");
    await jump.press("Enter");
    await expect(jump).toHaveValue("6");
    await expect(reader.locator('[data-pdf-page="6"] canvas')).toHaveAttribute(
      "data-pdf-rendered",
      "true",
    );
    await expect
      .poll(() =>
        stage.evaluate((s) => {
          const slot = s
              .querySelector('[data-pdf-page="6"]')!
              .getBoundingClientRect(),
            box = s.getBoundingClientRect();
          return Math.abs(
            slot.left - box.left - parseFloat(getComputedStyle(s).paddingLeft),
          );
        }),
      )
      .toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => scrollY)).toBe(0);
    await page.setViewportSize({
      width: width === 390 ? 768 : 1000,
      height: 650,
    });
    await expect
      .poll(() => stage.evaluate((s) => s.scrollHeight - s.clientHeight))
      .toBeLessThanOrEqual(2);
  });

for (const width of [390, 768, 1440])
  test(`hymn zoom and tool choices share one compact row at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.route(/^https:\/\//, (route) => route.abort());
    await preparePinnedReaderAssets(page);
    await page.goto("/GYSApp-Tauri/kidung/hymn-133?mode=pdf");
    const reader = page.locator(".pdf-reader-hymn");
    await expect(
      reader.locator('canvas[data-pdf-rendered="true"]').first(),
    ).toBeVisible({ timeout: 20_000 });
    await reader.locator(".pdf-advanced-toggle").click();
    const tools = reader.locator(".pdf-advanced-controls");
    await expect
      .poll(() => tools.evaluate((e) => e.getBoundingClientRect().height))
      .toBeLessThanOrEqual(70);
    const layouts = reader.getByRole("button", {
      name: "Layout PDF",
      exact: true,
    });
    await layouts.click();
    await expect(reader.locator(".pdf-layout-options")).toBeVisible();
    await layouts.press("Escape");
    await expect(reader.locator(".pdf-layout-options")).toBeHidden();
    await expect(tools).toBeVisible();
    await expect(layouts).toBeFocused();
  });
