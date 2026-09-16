import { expect, test, type Locator, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const auditViewports = [
  { width: 320, height: 720 },
  { width: 390, height: 844 },
  { width: 600, height: 900 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
] as const;

const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X2NDWQAAAABJRU5ErkJggg==",
  "base64",
);
const localPdfPath =
  "/GYSApp-Tauri/assets/pdf/001_Pujilah%20Allah%20Yang%20Maha%20Esa.pdf";

function literatureItems() {
  return [
    {
      id: "audit-article",
      category: "kesaksian",
      title:
        "Pimpinan Tuhan Di Masa Sukar Dengan Penyertaan Yang Menguatkan Keluarga",
      description: "Kesaksian tentang penyertaan Tuhan dalam masa sulit.",
      url: "https://tjc.org/id/kesaksian/audit-article/",
      format: "article",
      publishedAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/audit-cover-1.png",
    },
    {
      id: "audit-issue",
      category: "warta",
      title: "Warta Sejati September",
      description: "Edisi pembinaan keluarga dan pelayanan.",
      url: "https://tjc.org/id/warta/audit-issue/",
      format: "issue",
      publishedAt: "2026-08-28T00:00:00.000Z",
      updatedAt: "2026-08-28T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/audit-cover-2.png",
    },
    {
      id: "audit-renungan",
      category: "renungan",
      title: "Berakar Dalam Firman",
      description: "Renungan untuk bertumbuh dalam kehidupan rohani.",
      url: "https://tjc.org/id/renungan/audit-renungan/",
      format: "article",
      publishedAt: "2026-08-20T00:00:00.000Z",
      updatedAt: "2026-08-20T00:00:00.000Z",
      source: "tjc.org",
      imageUrl: "https://tjc.org/id/wp-content/uploads/audit-cover-3.png",
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
          {
            number: "1",
            text: "Percaya bahwa Yesus Kristus adalah Firman yang menjadi manusia, Ia berkorban mati di atas kayu salib demi menyelamatkan umat manusia yang berdosa, pada hari ketiga bangkit kembali dan naik ke Surga.",
          },
          {
            number: "2",
            text: "Percaya bahwa Kitab Suci Perjanjian Lama dan Perjanjian Baru yang diilhamkan oleh Allah adalah sumber tunggal kebenaran dan kehidupan beriman.",
          },
          {
            number: "3",
            text: "Percaya bahwa Gereja Yesus Sejati didirikan oleh Roh Kudus pada masa hujan akhir, untuk memulihkan kembali gereja benar di jaman para rasul.",
          },
        ],
      },
    ],
  };
}

async function installLiteratureFixture(page: Page) {
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-15T00:00:00.000Z",
        items: literatureItems(),
      },
    }),
  );
}

async function installFaithFixture(page: Page) {
  await page.route("**/offline/faith.json", (route) =>
    route.fulfill({ json: faithPack() }),
  );
}

async function prepare(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", async (route) => {
    if (route.request().resourceType() === "image") {
      await route.fulfill({ body: transparentPixel, contentType: "image/png" });
      return;
    }
    await route.abort();
  });
  await page.route("https://tjcorguploads.s3.amazonaws.com/**", (route) =>
    route.fulfill({ body: transparentPixel, contentType: "image/png" }),
  );
}

async function expectNoHorizontalOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

async function expectTouchTarget(locator: Locator, min = 44) {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(min);
  expect(box!.height).toBeGreaterThanOrEqual(min);
}

async function installLiteratureReaderFixture(page: Page) {
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-15T00:00:00.000Z",
        items: [
          {
            id: "audit-pdf",
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
}

async function installFaithPdfFixture(page: Page) {
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
}

test("reading catalogs stay flat, readable, and contained across layouts", async ({
  page,
}) => {
  for (const viewport of auditViewports) {
    await page.setViewportSize(viewport);
    await prepare(page);
    await installLiteratureFixture(page);
    await page.goto("/GYSApp-Tauri/literatur");
    await expect(page.locator(".literature-page")).toBeVisible();
    await expect(page.locator(".literature-copy strong").first()).toBeVisible();
    await expect(page.locator(".literature-shelf-item").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTarget(page.locator(".literature-row").first());

    const shelfItem = page.locator(".literature-shelf-item").first();
    await shelfItem.hover();
    const shelfStyle = await shelfItem.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        transform: style.transform,
        boxShadow: style.boxShadow,
      };
    });
    expect(shelfStyle.transform).toBe("none");
    expect(shelfStyle.boxShadow).toBe("none");

    if (viewport.width <= 390) {
      const metadata = page.locator(".literature-shelf-item small").first();
      const metadataStyle = await metadata.evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          fontSize: parseFloat(style.fontSize),
          whiteSpace: style.whiteSpace,
        };
      });
      expect(metadataStyle.fontSize).toBeGreaterThanOrEqual(11.5);
      expect(metadataStyle.whiteSpace).not.toBe("nowrap");
    }

    await installFaithFixture(page);
    await page.goto("/GYSApp-Tauri/iman");
    await expect(page.locator(".faith-page")).toBeVisible();
    await expect(page.locator(".faith-row-heading").first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectTouchTarget(page.locator(".faith-row-heading").first());

    const faithRowsStyle = await page
      .locator(".faith-rows")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { boxShadow: style.boxShadow, borderRadius: style.borderRadius };
      });
    expect(faithRowsStyle.boxShadow).toBe("none");
    expect(faithRowsStyle.borderRadius).toBe("0px");
  }
});

const readerViewports = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
] as const;

for (const viewport of readerViewports) {
  test(`reader chrome stays contained at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await prepare(page);
    await installLiteratureReaderFixture(page);
    await page.goto("/GYSApp-Tauri/literatur/audit-pdf?read=1");

    const literatureReader = page.locator(".literature-reader-panel");
    await expect(literatureReader).toBeVisible({ timeout: 20_000 });
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
    await expectNoHorizontalOverflow(page);

    await installFaithPdfFixture(page);
    await page.goto("/GYSApp-Tauri/iman");
    await page.locator(".faith-row-heading").first().click();
    const faithOverlay = page.locator(".faith-pdf-overlay");
    await expect(faithOverlay).toBeVisible({ timeout: 20_000 });
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
    await expectNoHorizontalOverflow(page);

    const overlayBox = await faithOverlay.boundingBox();
    expect(overlayBox).not.toBeNull();
    expect(overlayBox!.x).toBeGreaterThanOrEqual(-1);
    expect(overlayBox!.y).toBeGreaterThanOrEqual(-1);
    expect(overlayBox!.x + overlayBox!.width).toBeLessThanOrEqual(
      viewport.width + 1,
    );
    expect(overlayBox!.y + overlayBox!.height).toBeLessThanOrEqual(
      viewport.height + 1,
    );
    await expect(page.locator(".faith-pdf-head-actions button")).toBeVisible();
    await expectTouchTarget(page.locator(".faith-pdf-head-actions button"));
  });
}

test("reading themes preserve text hierarchy and reachable overlay chrome", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await installLiteratureFixture(page);
  await page.goto("/GYSApp-Tauri/literatur");

  for (const theme of ["light", "dark", "sepia", "amoled"] as const) {
    await page.evaluate((value) => {
      const raw = window.localStorage.getItem("gys-shell-settings-v1");
      const current = raw
        ? (JSON.parse(raw) as { version: 1; locale: string; theme: string })
        : { version: 1 as const, locale: "id", theme: "light" };
      window.localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ ...current, theme: value }),
      );
    }, theme);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const hierarchy = await page
      .locator(".literature-copy")
      .first()
      .evaluate((element) => {
        const strong = element.querySelector("strong")!;
        const small = element.querySelector("small")!;
        const row = element.closest(".literature-row")!;
        const strongStyle = getComputedStyle(strong);
        const smallStyle = getComputedStyle(small);
        const rowStyle = getComputedStyle(row);
        return {
          text: strongStyle.color,
          muted: smallStyle.color,
          border: rowStyle.borderBottomColor,
        };
      });
    expect(hierarchy.text).not.toBe(hierarchy.muted);
    expect(hierarchy.border).not.toBe("rgba(0, 0, 0, 0)");
  }

  await installFaithPdfFixture(page);
  await page.goto("/GYSApp-Tauri/iman");
  await page.locator(".faith-row-heading").first().click();
  await expect(page.locator(".faith-pdf-overlay")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".faith-pdf-head-actions button")).toBeVisible();
});
