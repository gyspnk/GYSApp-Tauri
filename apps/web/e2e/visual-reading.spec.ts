import { expect, test, type Page } from "@playwright/test";

const viewports = [
  { name: "320x720", width: 320, height: 720 },
  { name: "390x844", width: 390, height: 844 },
  { name: "600x900", width: 600, height: 900 },
  { name: "768x1024", width: 768, height: 1024 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1920x1080", width: 1920, height: 1080 },
] as const;

const readerViewports = [
  viewports[1],
  viewports[3],
  viewports[4],
  viewports[5],
] as const;
const localPdfPath =
  "/GYSApp-Tauri/assets/pdf/001_Pujilah%20Allah%20Yang%20Maha%20Esa.pdf";
const transparentPixel = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=",
  "base64",
);

async function prepare(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date("2026-09-12T06:00:00+07:00"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("https://raw.githubusercontent.com/**", (route) =>
    route.abort(),
  );
  await page.route("https://github.com/**", (route) => route.abort());
  await page.route("https://tjc.org/**", async (route) => {
    if (route.request().resourceType() === "image") return route.abort();
    await route.abort();
  });
  await page.route("https://tjcorguploads.s3.amazonaws.com/**", (route) =>
    route.fulfill({ body: transparentPixel, contentType: "image/png" }),
  );
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

async function assertThemePdfChrome(
  page: Page,
  selectors: {
    root: string;
    header: string;
    title: string;
    actions: string;
    content: string;
  },
): Promise<void> {
  const metrics = await page.locator(selectors.root).evaluate(
    (root, query) => {
      const parseColor = (value: string) => {
        const channels = value.match(/[\d.]+/g)?.map(Number) ?? [];
        return {
          r: channels[0] ?? 0,
          g: channels[1] ?? 0,
          b: channels[2] ?? 0,
          a: channels[3] ?? 1,
        };
      };
      const over = (
        foreground: ReturnType<typeof parseColor>,
        background: ReturnType<typeof parseColor>,
      ) => ({
        r: foreground.r * foreground.a + background.r * (1 - foreground.a),
        g: foreground.g * foreground.a + background.g * (1 - foreground.a),
        b: foreground.b * foreground.a + background.b * (1 - foreground.a),
      });
      const luminance = (color: { r: number; g: number; b: number }) =>
        [color.r, color.g, color.b]
          .map((channel) => channel / 255)
          .map((channel) =>
            channel <= 0.03928
              ? channel / 12.92
              : ((channel + 0.055) / 1.055) ** 2.4,
          )
          .reduce((sum, channel, index) =>
            sum + channel * [0.2126, 0.7152, 0.0722][index],
          0);
      const contrast = (
        foreground: { r: number; g: number; b: number },
        background: { r: number; g: number; b: number },
      ) => {
        const foregroundLuminance = luminance(foreground);
        const backgroundLuminance = luminance(background);
        const lighter = Math.max(foregroundLuminance, backgroundLuminance);
        const darker = Math.min(foregroundLuminance, backgroundLuminance);
        return (lighter + 0.05) / (darker + 0.05);
      };
      const rect = (element: Element | null) => {
        const box = element?.getBoundingClientRect();
        return box
          ? {
              left: box.left,
              top: box.top,
              right: box.right,
              bottom: box.bottom,
              width: box.width,
              height: box.height,
            }
          : null;
      };
      const overlaps = (
        first: ReturnType<typeof rect>,
        second: ReturnType<typeof rect>,
      ) =>
        Boolean(
          first &&
            second &&
            first.left < second.right &&
            first.right > second.left &&
            first.top < second.bottom &&
            first.bottom > second.top,
        );
      const rootStyle = getComputedStyle(root);
      const rootBackground = over(
        parseColor(rootStyle.backgroundColor),
        { r: 255, g: 255, b: 255, a: 1 },
      );
      const header = root.querySelector(query.header);
      const title = root.querySelector(query.title);
      const actions = root.querySelector(query.actions);
      const content = root.querySelector(query.content);
      const headerStyle = header ? getComputedStyle(header) : null;
      const headerBackground = headerStyle
        ? over(parseColor(headerStyle.backgroundColor), {
            ...rootBackground,
            a: 1,
          })
        : rootBackground;
      const textContrast = (element: Element | null, background = headerBackground) => {
        if (!element) return 0;
        const style = getComputedStyle(element);
        return contrast(
          over(parseColor(style.color), { ...background, a: 1 }),
          background,
        );
      };
      const actionElements = actions
        ? Array.from(actions.querySelectorAll("a, button"))
        : [];
      const actionRects = actionElements.map((element) => rect(element));
      const rootRect = rect(root);
      const headerRect = rect(header);
      const titleRect = rect(title);
      const actionsRect = rect(actions);
      const contentRect = rect(content);

      return {
        rootRect,
        headerRect,
        contentRect,
        titleRect,
        actionsRect,
        actionRects,
        titleContrast: textContrast(title),
        actionsContrast: actionElements.map((element) =>
          textContrast(element),
        ),
        toolbarContrast: textContrast(
          root.querySelector(".pdf-toolbar"),
          rootBackground,
        ),
        titleActionsOverlap: overlaps(titleRect, actionsRect),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
      };
    },
    selectors,
  );

  expect(metrics.rootRect?.left ?? Infinity).toBeLessThanOrEqual(1);
  expect(metrics.rootRect?.top ?? Infinity).toBeLessThanOrEqual(1);
  expect(metrics.rootRect?.width ?? 0).toBeGreaterThanOrEqual(
    metrics.viewportWidth - 1,
  );
  expect(metrics.rootRect?.height ?? 0).toBeGreaterThanOrEqual(
    metrics.viewportHeight - 1,
  );
  expect(metrics.headerRect).not.toBeNull();
  expect(metrics.contentRect).not.toBeNull();
  expect(metrics.titleRect).not.toBeNull();
  expect(metrics.actionsRect).not.toBeNull();
  expect(metrics.titleActionsOverlap).toBe(false);
  expect(metrics.titleContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.toolbarContrast).toBeGreaterThanOrEqual(4.5);
  expect(metrics.actionsContrast.length).toBeGreaterThan(0);
  expect(metrics.actionsContrast.every((ratio) => ratio >= 3)).toBe(true);
  expect(
    metrics.actionRects.every(
      (action) =>
        action !== null && action.width >= 44 && action.height >= 44,
    ),
  ).toBe(true);
}

async function setShellTheme(
  page: Page,
  theme: "dark" | "sepia" | "amoled",
): Promise<void> {
  await page.addInitScript((value) => {
    window.localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "id", theme: value }),
    );
  }, theme);
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
          {
            number: "4",
            text: "Percaya akan baptisan air untuk pengampunan dosa.",
          },
          { number: "5", text: "Percaya akan penerimaan Roh Kudus." },
          { number: "6", text: "Percaya akan sakramen basuh kaki." },
          { number: "7", text: "Percaya akan sakramen Perjamuan Kudus." },
          { number: "8", text: "Percaya bahwa hari Sabat adalah hari kudus." },
          {
            number: "9",
            text: "Percaya bahwa keselamatan adalah karena kasih karunia.",
          },
          {
            number: "10",
            text: "Percaya akan kedatangan Tuhan yang kedua kali.",
          },
        ],
      },
    ],
  };
}

for (const viewport of viewports) {
  test(`literature catalog ${viewport.name} visual baseline`, async ({
    page,
  }) => {
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
    await expect(
      page.getByRole("heading", { name: "Literatur" }),
    ).toBeVisible();
    await expect(page.locator(".literature-row")).toHaveCount(6);
    await assertViewportIntegrity(page);
    await expect(
      page.locator(".literature-cover .img-with-skeleton").first(),
    ).toHaveClass(/is-loaded/, { timeout: 5_000 });
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
              description:
                "Dokumen lokal deterministik untuk verifikasi reader.",
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

  test(`faith PDF overlay ${viewport.name} visual baseline`, async ({
    page,
  }) => {
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

test("dark literature catalog theme sample", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await setShellTheme(page, "dark");
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
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await assertViewportIntegrity(page);
  await expect(page).toHaveScreenshot("literature-catalog-dark-390x844.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.005,
  });
});

test("sepia literature direct reader theme sample", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await prepare(page);
  await setShellTheme(page, "sepia");
  await page.route("**/offline/literature.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-12T00:00:00.000Z",
        items: [
          {
            id: "pdf-sepia",
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

  await page.goto("/GYSApp-Tauri/literatur/pdf-sepia?read=1");
  await expect(page.locator(".literature-reader-panel")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "sepia");
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
  await assertThemePdfChrome(page, {
    root: ".literature-pdf-backdrop",
    header: ".literature-pdf-overlay .section-title-row",
    title: ".literature-pdf-overlay .section-title-row h2",
    actions: ".literature-pdf-head-actions",
    content: ".literature-pdf-overlay .pdf-reader",
  });
  await expect(page).toHaveScreenshot("literature-reader-sepia-1440x900.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.005,
  });
});

test("AMOLED faith overlay theme sample", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await setShellTheme(page, "amoled");
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
  await expect(page.locator(".faith-pdf-overlay")).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "amoled");
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
  await assertThemePdfChrome(page, {
    root: ".faith-pdf-backdrop",
    header: ".faith-pdf-head",
    title: ".faith-pdf-title strong",
    actions: ".faith-pdf-head-actions",
    content: ".faith-pdf-body .pdf-reader",
  });
  await expect(page).toHaveScreenshot("faith-overlay-amoled-390x844.png", {
    animations: "disabled",
    caret: "hide",
    maxDiffPixelRatio: 0.005,
  });
});

test("AMOLED Faith overlay unavailable state keeps localized source actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await prepare(page);
  await page.addInitScript(() => {
    const locale = new URL(window.location.href).searchParams.get(
      "__gys_locale",
    );
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({
        version: 1,
        locale: locale === "en" || locale === "zh" ? locale : "id",
        theme: "amoled",
      }),
    );
  });
  await page.route("**/offline/faith.json", (route) =>
    route.fulfill({ json: faithPack() }),
  );
  await page.route("**/api/v1/content/pdf**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "official PDF not found",
    }),
  );
  await page.route(/Yesus-Kristus\.pdf/, (route) =>
    route.fulfill({
      status: 404,
      contentType: "text/plain",
      body: "official PDF not found",
    }),
  );

  const copies = {
    id: {
      readMore: "Baca lebih lanjut ↗",
      official: "PDF resmi ↗",
      source: "Buka halaman sumber resmi ↗",
      retry: "Coba lagi",
    },
    en: {
      readMore: "Read more ↗",
      official: "Official PDF ↗",
      source: "Open official source page ↗",
      retry: "Try again",
    },
    zh: {
      readMore: "阅读更多 ↗",
      official: "官方 PDF ↗",
      source: "打开官方来源页面 ↗",
      retry: "重试",
    },
  } as const;

  for (const locale of ["id", "en", "zh"] as const) {
    await page.goto(`/GYSApp-Tauri/iman?item=1&__gys_locale=${locale}`);
    await page.getByRole("button", { name: copies[locale].readMore }).click();
    await expect(page.getByRole("alert")).toContainText("HTTP 404");

    const overlay = page.locator(".faith-pdf-overlay");
    await expect(overlay).toBeVisible();
    await expect(
      overlay.getByRole("link", { name: copies[locale].official }),
    ).toHaveAttribute("href", /Yesus-Kristus\.pdf/);
    await expect(
      overlay.getByRole("link", { name: copies[locale].source }),
    ).toHaveAttribute("href", /dk-yesus-kristus/);
    await expect(
      overlay.getByRole("button", { name: copies[locale].retry }),
    ).toBeVisible();
    await assertViewportIntegrity(page);
    await assertThemePdfChrome(page, {
      root: ".faith-pdf-backdrop",
      header: ".faith-pdf-head",
      title: ".faith-pdf-title strong",
      actions: ".faith-pdf-head-actions",
      content: ".faith-pdf-body .pdf-reader",
    });

    if (locale === "id") {
      await expect(page).toHaveScreenshot(
        "faith-overlay-amoled-unavailable-390x844.png",
        {
          animations: "disabled",
          caret: "hide",
          maxDiffPixelRatio: 0.005,
        },
      );
    }
  }
});
