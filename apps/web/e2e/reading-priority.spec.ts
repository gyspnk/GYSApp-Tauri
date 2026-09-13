import { expect, test } from "@playwright/test";

const localPdfPath =
  "/GYSApp-Tauri/assets/pdf/001_Pujilah%20Allah%20Yang%20Maha%20Esa.pdf";

test.use({ serviceWorkers: "block" });

test("direct literature PDF exposes the document in the first mobile viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-12T00:00:00.000Z",
        items: [
          {
            id: "pdf-priority",
            category: "buku",
            title: "Panduan Uji PDF",
            description: "Dokumen lokal untuk kontrak pembaca content-first.",
            url: `http://127.0.0.1:4173${localPdfPath}`,
            format: "pdf",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );

  await page.goto("/GYSApp-Tauri/literatur/pdf-priority?read=1");
  const canvas = page
    .locator(".literature-reader-panel .pdf-pages canvas")
    .first();
  await expect
    .poll(() => canvas.evaluate((element) => element.width), {
      timeout: 20_000,
    })
    .toBeGreaterThan(0);

  const canvasTop = await canvas.evaluate(
    (element) => element.getBoundingClientRect().top,
  );
  expect(canvasTop).toBeLessThan(700);

  const tools = page.locator(".literature-reading-tools");
  await expect(tools).toBeVisible();
  await expect(tools).not.toHaveAttribute("open", "");
  await expect(tools.locator("summary")).toContainText(/kemajuan.*offline/i);

  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
});
