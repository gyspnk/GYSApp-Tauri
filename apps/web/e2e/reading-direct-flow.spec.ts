import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const tinyPdf = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF";

test("Literature PDF rows resume directly in the internal reader", async ({ page }) => {
  const resourceVersion = "2026-09-01T00:00:00.000Z";
  await page.addInitScript(({ resourceVersion }) => {
    localStorage.setItem(
      "gys-literature-progress-v2",
      JSON.stringify({
        "pdf-test": {
          version: 2,
          percent: 30,
          updatedAt: "2026-09-11T12:00:00.000Z",
          lastOpenedAt: "2026-09-11T12:00:00.000Z",
          resourceVersion,
          location: { kind: "page", page: 3, totalPages: 10 },
        },
      }),
    );
  }, { resourceVersion });
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-12T00:00:00.000Z",
        items: [
          {
            id: "pdf-test",
            category: "buku",
            title: "Panduan Uji PDF",
            description: "Dokumen uji alur baca langsung.",
            url: "https://tjc.org/id/wp-content/uploads/test.pdf",
            format: "pdf",
            publishedAt: resourceVersion,
            updatedAt: resourceVersion,
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route(/test\.pdf/, (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", body: tinyPdf }),
  );

  await page.goto("/GYSApp-Tauri/literatur");
  const row = page.locator(".literature-row").first();
  await expect(row).toContainText(/Lanjut.*halaman 3/i);
  await row.click();

  await expect(page).toHaveURL(/\/literatur\/pdf-test\?read=1$/);
  await expect(page.locator(".literature-detail-page")).toHaveClass(/is-direct-reader/);
  await expect(page.locator(".literature-reader-panel")).toBeVisible();
  await expect(page.locator(".literature-detail-hero")).toBeHidden();
});

test("Dasar Kepercayaan rows open the matching internal PDF directly and expose resume progress", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-faith-pdf-1",
      JSON.stringify({
        page: 4,
        totalPages: 10,
        percent: 40,
        lastOpenedAt: "2026-09-11T12:00:00.000Z",
      }),
    );
  });
  await page.route("**/offline/faith.json", (route) =>
    route.fulfill({
      json: {
        faith: [
          {
            language: "ID",
            title: "Dasar Kepercayaan",
            content: [
              {
                number: "1",
                text: "Percaya bahwa Yesus Kristus adalah Firman yang menjadi manusia.",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route(/Yesus-Kristus\.pdf/, (route) =>
    route.fulfill({ status: 200, contentType: "application/pdf", body: tinyPdf }),
  );

  await page.goto("/GYSApp-Tauri/iman");
  const row = page.locator(".faith-row-heading").first();
  await expect(row).toContainText(/Lanjut.*4/i);
  await row.click();

  await expect(page.locator(".faith-pdf-backdrop")).toBeVisible();
  await expect(page.locator(".faith-modal-backdrop")).toHaveCount(0);
  await expect(page.locator(".faith-pdf-stats")).toContainText(/Halaman 4\/10/);
  await expect(page.locator(".faith-pdf-progress")).toHaveAttribute("value", "40");
});

test("Sauh loading state is centered in the devotion panel body", async ({ page }) => {
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ json: { items: [] } }),
  );
  await page.route(/wp-json\/wp\/v2\/posts/, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 10_000));
    await route.abort("timedout");
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/GYSApp-Tauri/");
  const skeleton = page.getByTestId("home-sauh-skeleton");
  await expect(skeleton).toBeVisible();
  const delta = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>(".verse-panel");
    const loading = document.querySelector<HTMLElement>(".sauh-skeleton");
    if (!panel || !loading) return Number.POSITIVE_INFINITY;
    const panelBox = panel.getBoundingClientRect();
    const loadingBox = loading.getBoundingClientRect();
    const panelCenter = panelBox.top + panelBox.height / 2;
    const loadingCenter = loadingBox.top + loadingBox.height / 2;
    return Math.abs(panelCenter - loadingCenter);
  });
  expect(delta).toBeLessThanOrEqual(32);
});
