import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "390x844", width: 390, height: 844 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1440x900", width: 1440, height: 900 },
] as const;

const readerViewports = [viewports[0], viewports[2]] as const;
const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
  "base64",
);
const localPdfPath =
  "/GYSApp-Tauri/assets/pdf/001_Pujilah%20Allah%20Yang%20Maha%20Esa.pdf";

async function prepare(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-09-12T06:00:00+07:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({
        body: transparentPixel,
        contentType: "image/png",
      });
      return;
    }
    await route.abort();
  });
}

async function assertViewportIntegrity(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

function literatureItems() {
  return [
    {
      id: "visual-kesaksian",
      category: "kesaksian",
      title: "Pimpinan Tuhan Di Masa Sukar",
      description: "Kesaksian tentang penyertaan Tuhan dalam masa sulit.",
      url: "https://tjc.org/id/kesaksian/visual-kesaksian/",
      format: "article",
      publishedAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/visual-cover-1.png",
    },
    {
      id: "visual-warta",
      category: "warta",
      title: "Warta Sejati September",
      description: "Edisi pembinaan keluarga dan pelayanan.",
      url: "https://tjc.org/id/warta/visual-warta/",
      format: "issue",
      publishedAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/visual-cover-2.png",
    },
    {
      id: "visual-renungan",
      category: "renungan",
      title: "Berakar Dalam Firman",
      description: "Renungan untuk bertumbuh dalam kehidupan rohani.",
      url: "https://tjc.org/id/renungan/visual-renungan/",
      format: "article",
      publishedAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/visual-cover-3.png",
    },
    {
      id: "visual-panduan",
      category: "panduan",
      title: "Panduan Pemahaman Alkitab",
      description: "Bahan pendamping pembacaan dan diskusi Alkitab.",
      url: "https://tjc.org/id/panduan/visual-panduan/",
      format: "article",
      publishedAt: "2026-08-12T00:00:00.000Z",
      updatedAt: "2026-08-12T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/visual-cover-4.png",
    },
    {
      id: "visual-buku",
      category: "buku",
      title: "Iman Yang Teguh",
      description: "Buku pembinaan untuk kehidupan iman sehari-hari.",
      url: "https://tjc.org/id/wp-content/uploads/visual-buku.pdf",
      format: "pdf",
      publishedAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/visual-cover-5.png",
    },
    {
      id: "visual-pelita",
      category: "pelita-kecil",
      title: "Pelita Kecil: Kasih",
      description: "Bacaan keluarga yang ringkas dan ramah anak.",
      url: "https://tjc.org/id/pelita-kecil/visual-pelita/",
      format: "article",
      publishedAt: "2026-07-30T00:00:00.000Z",
      updatedAt: "2026-07-30T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/visual-cover-6.png",
    },
  ];
}

function faithPack() {
  return {
    faith: [
      {
        language: "ID",
        title: "Dasar Kepercayaan",
        content: [
          { number: "1", text: "Percaya bahwa Yesus Kristus adalah Firman." },
          { number: "2", text: "Percaya bahwa Alkitab adalah firman Allah." },
          { number: "3", text: "Percaya bahwa Gereja adalah tubuh Kristus." },
          { number: "4", text: "Percaya akan baptisan air untuk pengampunan dosa." },
          { number: "5", text: "Percaya akan penerimaan Roh Kudus." },
          { number: "6", text: "Percaya akan sakramen basuh kaki." },
          { number: "7", text: "Percaya akan sakramen Perjamuan Kudus." },
          { number: "8", text: "Percaya bahwa hari Sabat adalah hari kudus." },
          { number: "9", text: "Percaya bahwa keselamatan adalah karena kasih karunia." },
          { number: "10", text: "Percaya akan kedatangan Tuhan yang kedua kali." },
        ],
      },
    ],
  };
}

for (const viewport of viewports) {
  test(`literature catalog ${viewport.name} visual baseline`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.route("**/offline/literature.json", (route) =>
      route.fulfill({
        json: {
          source: "tjc.org",
          generatedAt: "2026-09-12T00:00:00.000Z",
          items: literatureItems(),
        },
      }),
    );

    await page.goto("/GYSApp-Tauri/literatur");
    await expect(page.locator(".literature-page")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Literatur" })).toBeVisible();
    await expect(page.locator(".literature-row")).toHaveCount(6);
    await assertViewportIntegrity(page);
    await page.waitForTimeout(250);

    await expect(page).toHaveScreenshot(
      `literature-catalog-${viewport.name}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
      },
    );
  });

  test(`faith catalog ${viewport.name} visual baseline`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.route("**/offline/faith.json", (route) =>
      route.fulfill({ json: faithPack() }),
    );

    await page.goto("/GYSApp-Tauri/iman");
    await expect(page.locator(".faith-page")).toBeVisible();
    await expect(page.locator(".faith-row-heading")).toHaveCount(10);
    await expect(page.locator(".faith-search-bar")).toBeVisible();
    await assertViewportIntegrity(page);
    await page.waitForTimeout(250);

    await expect(page).toHaveScreenshot(`faith-catalog-${viewport.name}.png`, {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
    });
  });
}

for (const viewport of readerViewports) {
  test(`literature direct PDF reader ${viewport.name} visual baseline`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await page.route("**/offline/literature.json", (route) =>
      route.fulfill({
        json: {
          source: "tjc.org",
          generatedAt: "2026-09-12T00:00:00.000Z",
          items: [
            {
              id: "pdf-visual",
              category: "buku",
              title: "Panduan Uji PDF",
              description: "Dokumen lokal deterministik untuk verifikasi reader.",
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

    await page.goto("/GYSApp-Tauri/literatur/pdf-visual?read=1");
    const reader = page.locator(".literature-reader-panel");
    await expect(reader).toBeVisible({ timeout: 20_000 });
    await expect(page.locator(".literature-detail-hero")).toBeHidden();
    await expect
      .poll(
        () =>
          page
            .locator(".pdf-pages canvas")
            .first()
            .evaluate((canvas) => canvas.width),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await assertViewportIntegrity(page);

    await expect(page).toHaveScreenshot(
      `literature-direct-reader-${viewport.name}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
      },
    );
  });

  test(`faith PDF overlay ${viewport.name} visual baseline`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    const pdfResponse = await page.request.get(localPdfPath);
    expect(pdfResponse.ok()).toBe(true);
    const pdfBytes = await pdfResponse.body();

    await page.route("**/offline/faith.json", (route) =>
      route.fulfill({ json: faithPack() }),
    );
    await page.route(/Yesus-Kristus\.pdf/, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/pdf",
        body: pdfBytes,
      }),
    );

    await page.goto("/GYSApp-Tauri/iman");
    await page.locator(".faith-row-heading").first().click();
    await expect(page.locator(".faith-pdf-backdrop")).toBeVisible({
      timeout: 20_000,
    });
    await expect
      .poll(
        () =>
          page
            .locator(".faith-pdf-overlay .pdf-pages canvas")
            .first()
            .evaluate((canvas) => canvas.width),
        { timeout: 20_000 },
      )
      .toBeGreaterThan(0);
    await assertViewportIntegrity(page);

    await expect(page).toHaveScreenshot(
      `faith-pdf-overlay-${viewport.name}.png`,
      {
        animations: "disabled",
        caret: "hide",
        maxDiffPixelRatio: 0.005,
      },
    );
  });
}
