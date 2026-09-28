import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "allow" });

test("downloaded literature PDF opens from cache after an offline reload", async ({
  page,
}) => {
  test.setTimeout(60_000);
  const validPdf = await readFile(
    new URL(
      "../public/assets/pdf/001_Pujilah Allah Yang Maha Esa.pdf",
      import.meta.url,
    ),
  );
  let pdfRequests = 0;
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-28T00:00:00.000Z",
        items: [
          {
            id: "offline-pdf-test",
            category: "buku",
            title: "Panduan Baca Offline",
            description: "PDF untuk uji cache offline.",
            url: "https://tjc.org/id/wp-content/uploads/offline-cache-test.pdf",
            format: "pdf",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route(/offline-cache-test\.pdf/, async (route) => {
    pdfRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: validPdf,
    });
  });

  await page.goto("/GYSApp-Tauri/");
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    {
      timeout: 20_000,
    },
  );
  await page.goto("/GYSApp-Tauri/literatur/offline-pdf-test");
  const tools = page.locator(".literature-reading-tools");
  await tools.getByRole("button", { name: "Unduh PDF" }).click();
  const openOffline = tools.getByRole("button", { name: "Buka offline" });
  await expect(openOffline).toBeVisible();
  await expect(
    page.getByText("PDF tersimpan untuk dibaca offline."),
  ).toBeVisible();
  expect(pdfRequests).toBe(1);

  // Warm PDF.js and its worker while connected, then prove the stored bytes
  // remain readable after both the app shell and reader route reload offline.
  await openOffline.click();
  const reader = page.locator(".literature-reader-panel .pdf-reader");
  await expect(reader).toHaveAttribute("data-pdf-loading-phase", "ready", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Tutup" }).click();
  await expect(page.locator(".literature-reader-panel")).toHaveCount(0);

  await page.unroute(/offline-cache-test\.pdf/);
  await page.context().setOffline(true);
  await page.reload();
  const offlineTools = page.locator(".literature-reading-tools");
  const openCached = offlineTools.getByRole("button", {
    name: "Buka offline",
  });
  await expect(openCached).toBeVisible({ timeout: 20_000 });
  await openCached.click();

  await expect(reader).toHaveAttribute("data-pdf-loading-phase", "ready", {
    timeout: 20_000,
  });
  await expect
    .poll(() =>
      reader
        .locator(".pdf-pages canvas")
        .first()
        .evaluate((canvas) => (canvas as HTMLCanvasElement).width),
    )
    .toBeGreaterThan(0);
  expect(pdfRequests).toBe(1);
});
