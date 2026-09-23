import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

test("text-first Kidung keeps PDF.js lazy until a PDF-backed feature is used", async ({
  page,
}) => {
  const pdfRuntimeRequests: string[] = [];
  page.on("request", (request) => {
    if (/pdf\.worker|pdf\.mjs/i.test(request.url()))
      pdfRuntimeRequests.push(request.url());
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(250);
  expect(pdfRuntimeRequests).toEqual([]);

  await page.getByRole("button", { name: "Tampilkan chord" }).click();
  await expect(
    page.getByRole("button", { name: "Sembunyikan chord" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() => pdfRuntimeRequests.length, { timeout: 20_000 })
    .toBeGreaterThan(0);
});

test("canonical chord and fork PDF assets open from hymn detail", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const forkPdfRequests: string[] = [];
  page.on("request", (request) => {
    if (/kr_master\.pdf/i.test(request.url()))
      forkPdfRequests.push(request.url());
  });
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Tampilkan chord" }).click();
  await expect(
    page.getByRole("button", { name: "Sembunyikan chord" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".chord-capability").first()).toBeVisible({
    timeout: 20_000,
  });
  await page.locator(".hymn-reader-settings-summary").click();
  await page.locator(".hymn-music-settings > summary").click();
  await page.getByRole("button", { name: "Nada dasar" }).click();
  await page.getByRole("option", { name: "D", exact: true }).click();
  await expect(page.locator(".transpose-control strong")).toHaveText("+2");
  await expect(page.locator(".lyrics-sheet")).toBeVisible();
  await page.getByRole("tab", { name: "PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator(".lyrics-sheet")).toHaveCount(0);
  await expect(page.locator(".pdf-chord-layer").first()).toBeVisible({
    timeout: 30_000,
  });
  // Source probing and PDF.js may make separate range requests, but every
  // request must stay within the two immutable Fork PDF candidates.
  expect(forkPdfRequests.length).toBeGreaterThan(0);
  expect(new Set(forkPdfRequests).size).toBeLessThanOrEqual(2);
  await expect(
    page.getByRole("button", { name: "Buka MIDI dari viewer" }),
  ).toHaveCount(0);
});

test("PDF failure exposes an actionable retry without leaving the hymn shell", async ({
  page,
}) => {
  await page.route("**/*.{pdf,PDF}", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/GYSApp-Data/**", (route) =>
    route.fulfill({ status: 503, body: "fallback unavailable" }),
  );
  await page.route("**/assets/pdf/**", (route) =>
    route.fulfill({ status: 503, body: "local seed unavailable" }),
  );
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({ timeout: 15_000 });
  await page.getByRole("tab", { name: "PDF" }).click();
  await expect(page.getByRole("alert")).toContainText("PDF gagal dimuat", {
    timeout: 20_000,
  });
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
});

test("literature PDF failure exposes retry inside the application reader shell", async ({
  page,
}) => {
  await page.route("**/*.{pdf,PDF}", (route) =>
    route.fulfill({ status: 503, body: "literature PDF unavailable" }),
  );
  await page.goto("/GYSApp-Tauri/literatur");
  const pdfLink = page
    .locator(".literature-row")
    .filter({ hasText: /PDF\s*·/ })
    .first();
  await expect(pdfLink).toBeVisible({
    timeout: 15_000,
  });
  await pdfLink.click();
  await expect(page).toHaveURL(/\/literatur\/.+\?read=1$/);
  await expect(page.getByRole("alert")).toContainText(
    "PDF gagal dimuat",
    {
      timeout: 20_000,
    },
  );
  await expect(
    page.getByRole("alert").getByRole("button", { name: "Coba lagi" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF resmi ↗" })).toBeVisible();
});

test("literature cover states stay honest without per-card fallback requests", async ({
  page,
}) => {
  const transparentPixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
    "base64",
  );
  const imageRequests: string[] = [];
  page.on("request", (request) => {
    if (request.resourceType() === "image") imageRequests.push(request.url());
  });
  await page.route("https://tjcorguploads.s3.amazonaws.com/**", (route) => {
    if (/broken-cover\.png/i.test(route.request().url())) {
      return route.fulfill({ status: 404, body: "missing cover" });
    }
    return route.fulfill({ body: transparentPixel, contentType: "image/png" });
  });
  await page.route("**/api/v1/content/image*", (route) => {
    const source = new URL(route.request().url()).searchParams.get("url") ?? "";
    if (/broken-cover\.png/i.test(source)) {
      return route.fulfill({ status: 404, body: "missing cover" });
    }
    return route.fulfill({ body: transparentPixel, contentType: "image/png" });
  });
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-12T00:00:00.000Z",
        items: [
          {
            id: "cover-official",
            category: "panduan",
            title: "Sampul Resmi",
            description: "Cover resmi tersedia.",
            url: "https://tjc.org/id/panduan/cover-official/",
            format: "pdf",
            publishedAt: "2026-09-03T00:00:00.000Z",
            updatedAt: "2026-09-03T00:00:00.000Z",
            source: "tjc.org",
            imageUrl:
              "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/official-cover.png",
          },
          {
            id: "coverless",
            category: "buku",
            title: "Tanpa Sampul",
            description: "Tidak ada cover resmi.",
            url: "https://tjc.org/id/buku/coverless/",
            format: "pdf",
            publishedAt: "2026-09-02T00:00:00.000Z",
            updatedAt: "2026-09-02T00:00:00.000Z",
            source: "tjc.org",
          },
          {
            id: "cover-error",
            category: "warta",
            title: "Sampul Gagal",
            description: "Cover resmi gagal dimuat.",
            url: "https://tjc.org/id/warta/cover-error/",
            format: "pdf",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
            imageUrl:
              "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/broken-cover.png",
          },
        ],
      },
    }),
  );

  await page.goto("/GYSApp-Tauri/literatur");
  await expect(page.locator(".literature-row")).toHaveCount(3);
  await expect(
    page.locator('.literature-cover[data-image-state="loaded"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.literature-cover.is-coverless[data-image-state="missing"]'),
  ).toHaveCount(1);
  await expect(
    page.locator('.literature-cover[data-image-state="error"]'),
  ).toHaveCount(1);
  await expect(
    page.locator(
      '.literature-cover[data-image-state="missing"] .img-fallback-placeholder',
    ),
  ).toHaveClass(/is-missing/);
  await expect(
    page.locator(
      '.literature-cover[data-image-state="error"] .img-fallback-placeholder',
    ),
  ).toHaveClass(/is-error/);
  await expect(
    page.locator(
      '.literature-cover[data-image-state="missing"] .img-fallback-placeholder',
    ),
  ).toHaveAttribute("aria-label", /Pratinjau tidak tersedia/);
  await expect(
    page.locator(
      '.literature-cover[data-image-state="error"] .img-fallback-placeholder',
    ),
  ).toHaveAttribute("aria-label", /Gagal memuat pratinjau/);

  const rowHeights = await page.locator(".literature-row").evaluateAll((rows) =>
    rows.map((row) => Math.round(row.getBoundingClientRect().height)),
  );
  expect(new Set(rowHeights).size).toBe(1);
  expect(imageRequests.filter((url) => /official-cover|broken-cover/.test(url))).toHaveLength(2);
  expect(imageRequests.some((url) => /coverless/.test(url))).toBe(false);
});

test("literature PDF stays inline and resumes the last page", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pdf = await readFile(
    new URL(
      "../public/assets/pdf/001_Pujilah Allah Yang Maha Esa.pdf",
      import.meta.url,
    ),
  );
  await page.route("**/*.{pdf,PDF}", async (route) => {
    await route.fulfill({
      body: pdf,
      headers: { "content-type": "application/pdf" },
    });
  });
  await page.goto("/GYSApp-Tauri/literatur");
  const pdfLink = page
    .locator(".literature-row")
    .filter({ hasText: /PDF\s*·/ })
    .first();
  await expect(pdfLink).toBeVisible({ timeout: 15_000 });
  await pdfLink.click();
  await expect(page).toHaveURL(/\/literatur\/.+\?read=1$/);
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pdf-toolbar")).toContainText("Halaman 1 / 1");

  await page.getByRole("button", { name: "Tutup" }).click();
  await expect(page).toHaveURL(/\/literatur$/);
  await expect(page.locator(".pdf-reader")).toHaveCount(0);
  const resume = page
    .locator(".literature-row")
    .filter({ hasText: /PDF\s*·/ })
    .first();
  await expect(resume).toContainText(/Lanjut.*halaman 1/i);
  await resume.click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator(".pdf-toolbar")).toContainText("Halaman 1 / 1");
});

test("hymn reader preferences persist and PDF layout adapts to a phone", async ({
  page,
}) => {
  await page.goto("/GYSApp-Tauri/kidung/hymn-133");
  await expect(page.locator(".lyrics-sheet")).toBeVisible({ timeout: 15_000 });
  await page.locator(".hymn-reader-settings-summary").click();
  await page.getByRole("button", { name: "Perbesar ukuran teks" }).click();
  await expect(page.locator(".lyrics-sheet")).toHaveCSS("font-size", "19px");
  await expect(page.locator(".lyrics-sheet")).toHaveAttribute(
    "data-autofit-font-size",
    "19",
  );
  await page.getByRole("tab", { name: "PDF" }).click();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await page
    .locator(".pdf-toolbar")
    .getByRole("button", { name: "Berikutnya" })
    .click();
  await page.reload();
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 30_000 });
  await page
    .locator(".pdf-toolbar")
    .getByRole("button", { name: "Sebelumnya" })
    .click();
  const resumeButton = page.locator('[data-pdf-resume="true"]');
  await expect(resumeButton).toBeVisible({ timeout: 15_000 });
  const resumeLabel = await resumeButton.textContent();
  const resumePage = resumeLabel?.match(/(\d+)$/)?.[1];
  if (!resumePage) throw new Error(`Unexpected resume label: ${resumeLabel}`);
  await resumeButton.click();
  await expect(page.locator(".pdf-toolbar")).toContainText("Halaman 2 / 2");
  const pdfOptions = page.locator(".pdf-reader-hymn .pdf-advanced-toggle");
  await expect(page.locator(".pdf-advanced-controls")).not.toHaveClass(
    /is-open/,
  );
  await pdfOptions.click();
  await page
    .locator(".pdf-layout-toggle")
    .getByRole("button", { name: "Mendatar" })
    .click();
  await expect(page.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "horizontal",
  );
  await pdfOptions.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".pdf-advanced-controls")).not.toHaveClass(
    /is-open/,
  );
  await pdfOptions.click();
  await page.getByRole("button", { name: "2 halaman" }).click();
  await expect(page.locator(".pdf-stage")).toHaveAttribute(
    "data-pdf-layout",
    "single",
  );
});

test("rapid hymn/viewer changes keep the latest route and do not leak stale PDF state", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.goto("/GYSApp-Tauri/kidung/hymn-001");
  await expect(
    page.getByRole("heading", { name: /Pujilah Allah/ }),
  ).toBeVisible({ timeout: 15_000 });

  // Start two heavyweight, cancellable paths and immediately change the
  // entity. The keyed detail boundary plus run guards must leave the second
  // hymn in a text-first state rather than displaying hymn-001's late PDF.
  await page.getByRole("button", { name: "Tampilkan chord" }).click();
  await page.getByRole("tab", { name: "PDF" }).click();
  await page.getByRole("button", { name: "Kembali ke lirik" }).click();
  await page.getByRole("button", { name: "Berikutnya", exact: true }).click();

  await expect(page).toHaveURL(/\/kidung\/hymn-002$/);
  await expect(page.locator(".lyrics-sheet")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".pdf-reader")).toHaveCount(0);
  await expect(page.locator(".hymn-detail-page h1")).not.toHaveText(
    "Pujilah Allah",
  );
});
