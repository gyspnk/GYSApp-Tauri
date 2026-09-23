import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Sauh outage shows an actionable empty state instead of a fabricated daily verse", async ({
  page,
}) => {
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/api/v1/content/sauh", (route) =>
    route.fulfill({ status: 503, body: "upstream unavailable" }),
  );
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ status: 503, body: "snapshot unavailable" }),
  );

  await page.goto("/GYSApp-Tauri/");
  await expect(page.locator(".sauh-offline-state")).toBeVisible();
  await expect(page.getByText("Sauh hari ini belum tersedia")).toBeVisible();
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  await expect(
    page.locator(".sauh-offline-state").getByText("Firman untuk hari ini"),
  ).toHaveCount(0);
  await expect(page.locator(".verse-panel blockquote")).toHaveCount(0);
});

test("Sauh route keeps semantic chrome localized and contained", async ({
  page,
}) => {
  const copies = {
    id: {
      back: "← Beranda",
      title: "Sauh Bagi Jiwa",
      today: "hari ini",
      direct: "sumber langsung TJC",
      source: "Buka di tjc.org →",
      alt: "Ilustrasi Renungan lintas bahasa",
    },
    en: {
      back: "← Home",
      title: "Sauh Bagi Jiwa",
      today: "today",
      direct: "direct TJC source",
      source: "Open tjc.org →",
      alt: "Illustration of Renungan lintas bahasa",
    },
    zh: {
      back: "← 主页",
      title: "生命之锚",
      today: "今日",
      direct: "TJC 直接来源",
      source: "在 tjc.org 打开 →",
      alt: "Renungan lintas bahasa 的插图",
    },
  } as const;

  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });

  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({
      json: {
        items: [
          {
            id: "sauh-locale-check",
            title: "Renungan lintas bahasa",
            reference: "Yohanes 3:16",
            verse: "Karena begitu besar kasih Allah akan dunia ini.",
            body: "Konten renungan untuk memeriksa tampilan route.",
            url: "https://tjc.org/id/gerakan-baca-alkitab/sauh-locale-check/",
            imageUrl:
              "https://tjc.org/wp-content/uploads/sauh-locale-check.jpg",
            updatedAt: new Date().toISOString(),
            source: "tjc.org",
          },
        ],
      },
    }),
  );
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.abort("connectionrefused"),
  );

  for (const locale of ["id", "en", "zh"] as const) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/GYSApp-Tauri/sauh?__gys_locale=${locale}`);
    const copy = copies[locale];
    await expect(page.getByTestId("sauh-page")).toBeVisible();
    await expect(page.getByRole("link", { name: copy.back })).toBeVisible();
    await expect(
      page.getByText(`${copy.title} · ${copy.today}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText(`${copy.title} · ${copy.direct}`, { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Renungan lintas bahasa" }),
    ).toBeVisible();
    await expect(page.getByRole("img", { name: copy.alt })).toBeVisible();
    await expect(page.getByRole("link", { name: copy.source })).toBeVisible();

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: width < 600 ? 720 : 900 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth + 1,
          ),
        )
        .toBe(true);
    }
  }
});

test("Sauh route error actions stay localized across locales", async ({
  page,
}) => {
  const copies = {
    id: {
      unavailable: "Renungan hari ini belum tersedia.",
      body: "Periksa koneksi atau buka sumber resmi untuk membaca renungan terbaru.",
      detail: "Detail teknis",
      retry: "Coba lagi",
      source: "Buka di tjc.org →",
    },
    en: {
      unavailable: "Today's reflection is unavailable.",
      body: "Check your connection or open the official source for the latest reflection.",
      detail: "Technical detail",
      retry: "Try again",
      source: "Open tjc.org →",
    },
    zh: {
      unavailable: "今日灵修内容暂不可用。",
      body: "请检查网络连接，或打开官方来源阅读最新灵修内容。",
      detail: "技术详情",
      retry: "重试",
      source: "在 tjc.org 打开 →",
    },
  } as const;

  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale !== "id" && locale !== "en" && locale !== "zh") return;
    localStorage.setItem("gys-locale", locale);
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale, theme: "light" }),
    );
  });
  await page.route("**/offline/sauh.json", (route) =>
    route.fulfill({ status: 503, body: "snapshot unavailable" }),
  );
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.abort("connectionrefused"),
  );

  for (const locale of ["id", "en", "zh"] as const) {
    await page.goto(`/GYSApp-Tauri/sauh?__gys_locale=${locale}`);
    const copy = copies[locale];
    const state = page.locator(".sauh-inline-error");
    await expect(state).toBeVisible({ timeout: 10_000 });
    await expect(state).toContainText(copy.unavailable);
    await expect(state).toContainText(copy.body);
    await expect(state).toContainText(copy.detail);
    await expect(
      state.getByRole("button", { name: copy.retry, exact: true }),
    ).toBeVisible();
    await expect(
      state.getByRole("link", { name: copy.source, exact: true }),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth + 1,
        ),
      )
      .toBe(true);
  }
});
