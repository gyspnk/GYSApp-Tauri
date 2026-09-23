import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ serviceWorkers: "block" });

const tinyPdf = [
  "%PDF-1.4",
  "1 0 obj",
  "<< /Type /Catalog >>",
  "endobj",
  "trailer",
  "<< /Root 1 0 R >>",
  "%%EOF",
].join("\n");

test("literature PDF opens directly, resumes, and closes back to the shelf", async ({
  page,
}) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      "gys-literature-progress-v2",
      JSON.stringify({
        "pdf-test": {
          version: 2,
          percent: 30,
          updatedAt: "2026-09-11T12:00:00.000Z",
          lastOpenedAt: "2026-09-11T12:00:00.000Z",
          resourceVersion: "2026-09-01T00:00:00.000Z",
          location: { kind: "page", page: 3, totalPages: 10 },
        },
      }),
    );
  });
  await page.route("**/offline/literature.json", (route) => {
    return route.fulfill({
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
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    });
  });
  await page.route(/test\.pdf/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: tinyPdf,
    });
  });

  await page.goto("/GYSApp-Tauri/literatur");
  const row = page.locator(".literature-row").first();
  await expect(row).toContainText(/Lanjut.*halaman 3/i);
  await row.click();

  await expect(page).toHaveURL(/\/literatur\/pdf-test\?read=1$/);
  await expect(page.locator(".literature-detail-page")).toHaveClass(
    /is-direct-reader/,
  );
  const reader = page.locator(".literature-reader-panel");
  await expect(reader).toBeVisible();
  await expect(page.locator(".literature-detail-hero")).toBeHidden();
  await expect(reader.getByRole("button", { name: "Tutup" })).toBeFocused();

  await reader.getByRole("button", { name: "Tutup" }).click();
  await expect(page).toHaveURL(/\/literatur$/);
  await expect(page.locator(".literature-reader-panel")).toHaveCount(0);
  await expect(page.locator("#main-content")).toBeFocused();
});

test("literature PDF overlay keeps localized actions reachable across widths", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const locale = new URL(window.location.href).searchParams.get(
      "__gys_locale",
    );
    if (locale === "id" || locale === "en" || locale === "zh") {
      localStorage.setItem("gys-locale", locale);
      localStorage.removeItem("gys-shell-settings-v1");
    }
  });
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-12T00:00:00.000Z",
        items: [
          {
            id: "pdf-overlay-test",
            category: "panduan",
            title: "Panduan Uji Overlay",
            description: "Dokumen uji chrome viewer PDF.",
            url: "https://tjc.org/id/wp-content/uploads/overlay-test.pdf",
            format: "pdf",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route(/overlay-test\.pdf/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: tinyPdf,
    }),
  );

  const copies = {
    id: { source: "PDF resmi ↗", close: "Tutup" },
    en: { source: "Official PDF ↗", close: "Close" },
    zh: { source: "官方 PDF ↗", close: "关闭" },
  } as const;

  for (const locale of ["id", "en", "zh"] as const) {
    for (const viewport of locale === "id"
      ? [320, 390, 768, 1024, 1440]
      : [390]) {
      await page.setViewportSize({ width: viewport, height: 720 });
      await page.goto(
        `/GYSApp-Tauri/literatur/pdf-overlay-test?read=1&__gys_locale=${locale}`,
      );

      const overlay = page.locator(".literature-pdf-overlay");
      await expect(overlay).toBeVisible();
      await expect(overlay.locator(".pdf-reader")).toHaveCount(1);
      const source = page.getByRole("link", { name: copies[locale].source });
      const close = page.getByRole("button", { name: copies[locale].close });
      await expect(source).toBeVisible();
      await expect(close).toBeVisible();
      await expect(close).toBeFocused();
      await expect(source).toHaveAttribute("href", /overlay-test\.pdf/);

      for (const control of [source, close]) {
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }

      const headerGeometry = await overlay
        .locator(".section-title-row")
        .evaluate((element) => {
          const title = element.querySelector("h2")?.getBoundingClientRect();
          const actions = element
            .querySelector(".literature-pdf-head-actions")
            ?.getBoundingClientRect();
          return {
            overflow: element.scrollWidth - element.clientWidth,
            titleRight: title?.right ?? 0,
            actionsLeft: actions?.left ?? 0,
          };
        });
      expect(headerGeometry.overflow).toBeLessThanOrEqual(1);
      expect(headerGeometry.titleRight).toBeLessThanOrEqual(
        headerGeometry.actionsLeft,
      );

      if (locale === "id" && viewport === 320) {
        const focusable = overlay.locator(
          'button:not([disabled]):not([aria-hidden="true"]):visible, input:not([disabled]):not([aria-hidden="true"]):visible, select:not([disabled]):not([aria-hidden="true"]):visible, textarea:not([disabled]):not([aria-hidden="true"]):visible, a[href]:not([aria-hidden="true"]):visible, [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"]):visible',
        );
        await focusable.last().focus();
        await page.keyboard.press("Tab");
        await expect(focusable.first()).toBeFocused();
        await focusable.first().focus();
        await page.keyboard.press("Shift+Tab");
        await expect(focusable.last()).toBeFocused();
        await close.press("Enter");
        await expect(page).toHaveURL(/\/literatur$/);
        await expect(page.locator("#main-content")).toBeFocused();
      }
    }
  }
});

test("slow literature PDF exposes a bounded retry without changing its source", async ({
  page,
}) => {
  test.setTimeout(30_000);
  const validPdf = await readFile(
    new URL(
      "../public/assets/pdf/001_Pujilah Allah Yang Maha Esa.pdf",
      import.meta.url,
    ),
  );
  let requestCount = 0;
  let releaseFirstRequest: (() => void) | undefined;
  const firstRequestHeld = new Promise<void>((resolve) => {
    releaseFirstRequest = resolve;
  });

  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-12T00:00:00.000Z",
        items: [
          {
            id: "pdf-slow-test",
            category: "panduan",
            title: "Panduan Uji PDF Lambat",
            description: "Dokumen uji indikator PDF lambat.",
            url: "https://tjc.org/id/wp-content/uploads/slow-test.pdf",
            format: "pdf",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route(/slow-test\.pdf/, async (route) => {
    requestCount += 1;
    if (requestCount === 1) {
      await firstRequestHeld;
      try {
        await route.fulfill({
          status: 200,
          contentType: "application/pdf",
          body: validPdf,
        });
      } catch {
        // The retry intentionally destroys this held request.
      }
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: validPdf,
    });
  });

  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/GYSApp-Tauri/literatur/pdf-slow-test?read=1");
  const reader = page.locator(".pdf-reader");
  await expect(reader).toHaveAttribute("data-pdf-loading-phase", "loading");
  await expect(reader).toHaveAttribute("data-pdf-loading-phase", "slow", {
    timeout: 6_000,
  });
  await expect(page.getByText(/PDF masih memuat lebih lama/i)).toBeVisible();
  await expect(page.getByRole("link", { name: "PDF resmi ↗" })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);

  await page.locator('[data-pdf-retry="true"]').click();
  await expect
    .poll(() => requestCount, { timeout: 5_000 })
    .toBeGreaterThanOrEqual(2);
  await expect(reader).toHaveAttribute("data-pdf-loading-phase", "ready", {
    timeout: 10_000,
  });
  await expect(reader.locator(".pdf-pages canvas").first()).toHaveCount(1);

  releaseFirstRequest?.();
  await page.waitForTimeout(2_700);
  await expect(reader).toHaveAttribute("data-pdf-loading-phase", "ready");
});

test("literature issue resolves its direct PDF instead of opening raw article text", async ({
  page,
}) => {
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-12T00:00:00.000Z",
        items: [
          {
            id: "issue-test",
            category: "warta",
            title: "Warta Uji PDF",
            description: "Edisi uji untuk pembuka PDF internal.",
            url: "https://tjc.org/id/warta-sejati/ws126/",
            format: "issue",
            publishedAt: "2026-09-01T00:00:00.000Z",
            updatedAt: "2026-09-01T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/wp-json/wp/v2/posts*", (route) =>
    route.fulfill({
      json: [
        {
          content: {
            rendered:
              '<p><a href="https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2025/12/WS126.pdf">Unduh PDF</a></p>',
          },
        },
      ],
    }),
  );
  await page.route(/WS126\.pdf/, (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: tinyPdf,
    }),
  );

  await page.goto("/GYSApp-Tauri/literatur/issue-test?read=1");
  await expect(page.locator(".literature-reader-panel")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator(".pdf-reader")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".literature-article-reader")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "PDF resmi ↗" })).toHaveAttribute(
    "href",
    /WS126\.pdf/,
  );
});

test("faith row opens PDF directly and shows resume", async ({ page }) => {
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
  await page.route("**/offline/faith.json", (route) => {
    return route.fulfill({
      json: {
        faith: [
          {
            language: "ID",
            title: "Dasar Kepercayaan",
            content: [
              {
                number: "1",
                text: "Percaya bahwa Yesus Kristus adalah Firman.",
              },
            ],
          },
        ],
      },
    });
  });
  await page.route(/Yesus-Kristus\.pdf/, (route) => {
    return route.fulfill({
      status: 200,
      contentType: "application/pdf",
      body: tinyPdf,
    });
  });

  await page.goto("/GYSApp-Tauri/iman");
  const row = page.locator(".faith-row-heading").first();
  await expect(row).toContainText(/Lanjut.*4/i);
  await row.click();

  await expect(page.locator(".faith-pdf-backdrop")).toBeVisible();
  await expect(page.locator(".faith-modal-backdrop")).toHaveCount(0);
  await expect(page.locator(".faith-pdf-stats")).toContainText(/Halaman 4\/10/);
  await expect(page.locator(".faith-pdf-progress")).toHaveAttribute(
    "value",
    "40",
  );
});

test("faith PDF overlay keeps both official links reachable across locales and widths", async ({
  page,
}) => {
  const copies = {
    id: {
      official: "PDF resmi ↗",
      source: "Buka halaman sumber resmi ↗",
      close: "Tutup bacaan",
    },
    en: {
      official: "Official PDF ↗",
      source: "Open official source page ↗",
      close: "Close reading",
    },
    zh: {
      official: "官方 PDF ↗",
      source: "打开官方来源页面 ↗",
      close: "关闭阅读",
    },
  } as const;
  await page.addInitScript(() => {
    const locale = new URL(window.location.href).searchParams.get(
      "__gys_locale",
    );
    if (locale === "id" || locale === "en" || locale === "zh") {
      localStorage.setItem("gys-locale", locale);
      localStorage.removeItem("gys-shell-settings-v1");
    }
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
                text: "Percaya bahwa Yesus Kristus adalah Firman.",
              },
            ],
          },
        ],
      },
    }),
  );
  await page.route("**/*.{pdf,PDF}", (route) =>
    route.fulfill({ status: 503, body: "faith PDF unavailable" }),
  );

  for (const locale of ["id", "en", "zh"] as const) {
    for (const viewport of locale === "id"
      ? [320, 390, 768, 1024, 1440]
      : [390]) {
      await page.setViewportSize({ width: viewport, height: 720 });
      await page.goto(`/GYSApp-Tauri/iman?__gys_locale=${locale}`);
      const row = page.locator(".faith-row-heading").first();
      await row.click();

      const overlay = page.locator(".faith-pdf-overlay");
      await expect(overlay).toBeVisible();
      const links = overlay.locator(".faith-pdf-head-actions a");
      await expect(links).toHaveCount(2);
      await expect(
        page.getByRole("link", { name: copies[locale].official, exact: true }),
      ).toHaveAttribute("href", /Yesus-Kristus\.pdf/);
      await expect(
        page.getByRole("link", { name: copies[locale].source, exact: true }),
      ).toHaveAttribute("href", /dk-yesus-kristus/);
      const close = page.getByRole("button", {
        name: copies[locale].close,
        exact: true,
      });
      await expect(close).toBeVisible();
      await expect(close).toBeFocused();

      for (const control of [links.nth(0), links.nth(1), close]) {
        const box = await control.boundingBox();
        expect(box?.width).toBeGreaterThanOrEqual(44);
        expect(box?.height).toBeGreaterThanOrEqual(44);
      }

      const headerGeometry = await overlay
        .locator(".faith-pdf-head")
        .evaluate((element) => {
          const boxes = [
            ".faith-pdf-title",
            ".faith-pdf-stats",
            ".faith-pdf-head-actions",
          ]
            .map((selector) =>
              element.querySelector<HTMLElement>(selector)?.getBoundingClientRect(),
            )
            .filter((box): box is DOMRect => Boolean(box));
          const overlaps = boxes.some((first, firstIndex) =>
            boxes.slice(firstIndex + 1).some(
              (second) =>
                first.left < second.right &&
                first.right > second.left &&
                first.top < second.bottom &&
                first.bottom > second.top,
            ),
          );
          return {
            overflow: element.scrollWidth - element.clientWidth,
            overlaps,
          };
        });
      expect(headerGeometry.overflow).toBeLessThanOrEqual(1);
      expect(headerGeometry.overlaps).toBe(false);
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        )
        .toBe(true);

      if (locale === "id" && viewport === 320) {
        const focusable = overlay.locator(
          'button:not([disabled]):not([aria-hidden="true"]):visible, input:not([disabled]):not([aria-hidden="true"]):visible, select:not([disabled]):not([aria-hidden="true"]):visible, textarea:not([disabled]):not([aria-hidden="true"]):visible, a[href]:not([aria-hidden="true"]):visible, [tabindex]:not([tabindex="-1"]):not([aria-hidden="true"]):visible',
        );
        await focusable.last().focus();
        await page.keyboard.press("Tab");
        await expect(focusable.first()).toBeFocused();
        await focusable.first().focus();
        await page.keyboard.press("Shift+Tab");
        await expect(focusable.last()).toBeFocused();
        await page.keyboard.press("Escape");
      } else {
        await close.focus();
        await close.press("Enter");
      }
      await expect(overlay).toBeHidden();
      await expect(row).toBeFocused();
    }
  }
});

test("faith PDF 404 keeps the official source and exposes a quiet retry", async ({
  page,
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      !message.text().includes("Failed to load resource: the server responded with a status of 404")
    )
      consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const notFound = (route: import("@playwright/test").Route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "official PDF not found",
    });
  await page.route("**/api/v1/content/pdf**", notFound);
  await page.route("**/Yesus-Kristus.pdf**", notFound);

  await page.goto("/GYSApp-Tauri/iman?item=1");
  await page.getByRole("button", { name: "Baca lebih lanjut ↗" }).click();

  await expect(page.getByRole("alert")).toContainText("HTTP 404", {
    timeout: 20_000,
  });
  await expect(page.locator('[data-pdf-error-status="404"]')).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Buka halaman sumber resmi ↗" }),
  ).toHaveAttribute("href", /dk-yesus-kristus/);
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();

  await page.getByRole("button", { name: "Coba lagi" }).click();
  await expect(page.getByRole("alert")).toContainText("HTTP 404", {
    timeout: 20_000,
  });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("Sauh loading state is centered", async ({ page }) => {
  await page.route("**/offline/sauh.json", (route) => {
    return route.fulfill({ json: { items: [] } });
  });
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
