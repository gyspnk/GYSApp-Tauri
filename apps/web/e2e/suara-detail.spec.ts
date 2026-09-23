import { expect, test, type Page } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const post = {
  id: "kesaksian-detail",
  title: "Menapaki Tiga Iman Bag",
  excerpt: "Cuplikan kesaksian resmi untuk pengujian detail.",
  url: "https://tjc.org/id/suarasejati/kesaksian-detail/",
  imageUrl:
    "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2023/11/27-300x166.png",
  publishedAt: "2023-12-20T00:00:00.000Z",
  source: "tjc.org",
};

const article = {
  id: post.id,
  title: post.title,
  body: "Isi artikel kesaksian resmi untuk pengujian tampilan detail.",
  url: post.url,
  source: "tjc.org",
  fetchedAt: "2026-09-20T00:00:00.000Z",
};

const localeCopy = {
  id: {
    back: "← Beranda",
    title: "Suara Sejati",
    label: "Suara Sejati",
    source: "Sumber resmi ↗",
    home: "Kembali ke beranda",
    alt: "Thumbnail Menapaki Tiga Iman Bag",
    loading: "Membuka kesaksian…",
    error: "Artikel resmi belum dapat dimuat.",
    retry: "Coba lagi",
  },
  en: {
    back: "← Home",
    title: "True Voice",
    label: "True Voice",
    source: "Official source ↗",
    home: "Back to Home",
    alt: "Thumbnail for Menapaki Tiga Iman Bag",
    loading: "Opening testimony…",
    error: "The official article could not be loaded.",
    retry: "Try again",
  },
  zh: {
    back: "← 主页",
    title: "真实声音",
    label: "真实声音",
    source: "官方来源 ↗",
    home: "返回主页",
    alt: "Menapaki Tiga Iman Bag 的缩略图",
    loading: "正在打开见证…",
    error: "官方文章暂时无法加载。",
    retry: "重试",
  },
} as const;

const pixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function installSuaraFixtures(
  page: Page,
  options: {
    feedDelayMs?: number;
    post?: typeof post;
  } = {},
) {
  const fixturePost = options.post ?? post;
  const fixtureArticle = {
    ...article,
    id: fixturePost.id,
    url: fixturePost.url,
  };
  await page.route("**/offline/suara-sejati.json", async (route) => {
    if (options.feedDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.feedDelayMs));
    }
    await route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-20T00:00:00.000Z",
        items: [fixturePost],
      },
    });
  });
  await page.route("**/api/v1/content/suara-sejati", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-09-20T00:00:00.000Z",
        items: [fixturePost],
      },
    }),
  );

  await page.route("**/api/v1/content/article*", (route) => {
    return route.fulfill({ json: fixtureArticle });
  });
  await page.route("**/wp-json/wp/v2/posts**", (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route("https://tjcorguploads.s3.amazonaws.com/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "image/png",
      headers: { "cache-control": "public, max-age=604800" },
      body: pixelPng,
    }),
  );
}

test("Suara detail localizes ready state and stays contained across devices", async ({
  page,
}) => {
  await installSuaraFixtures(page);
  await page.addInitScript(() => {
    const locale = new URLSearchParams(window.location.search).get(
      "__gys_locale",
    );
    if (locale === "id" || locale === "en" || locale === "zh") {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale, theme: "light" }),
      );
    }
  });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  for (const locale of ["id", "en", "zh"] as const) {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/GYSApp-Tauri/suara/${post.id}?__gys_locale=${locale}`);
      const detail = page.getByTestId("suara-detail-page");
      await expect(detail).toBeVisible();
      await expect(
        detail.getByRole("link", { name: localeCopy[locale].back }),
      ).toBeVisible();
      await expect(
        detail.getByText(localeCopy[locale].label, { exact: true }),
      ).toBeVisible();
      await expect(
        detail.getByRole("heading", { name: post.title }),
      ).toBeVisible();
      await expect(
        detail.getByRole("link", { name: localeCopy[locale].source }),
      ).toHaveAttribute("href", post.url);
      await expect(
        detail.getByRole("link", { name: localeCopy[locale].home }),
      ).toBeVisible();
      await expect(detail.locator(".date-line")).toContainText(
        localeCopy[locale].label,
      );
      await expect(detail.locator("img")).toHaveAttribute(
        "alt",
        localeCopy[locale].alt,
      );
      await expect
        .poll(() =>
          detail.locator("img").evaluate((image) => ({
            complete: image.complete,
            naturalWidth: image.naturalWidth,
          })),
        )
        .toEqual({ complete: true, naturalWidth: 1 });

      const metrics = await detail.evaluate(() => {
        const card = document.querySelector<HTMLElement>(".suara-article-card");
        const actions = [
          ...document.querySelectorAll<HTMLElement>(
            ".suara-article-card .detail-actions > a",
          ),
        ];
        return {
          cardWidth: card?.getBoundingClientRect().width ?? 0,
          actionHeights: actions.map(
            (action) => action.getBoundingClientRect().height,
          ),
          scrollWidth: document.documentElement.scrollWidth,
          viewportWidth: window.innerWidth,
        };
      });
      expect(metrics.cardWidth).toBeGreaterThan(0);
      expect(metrics.actionHeights.every((height) => height >= 44)).toBe(true);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(
        metrics.viewportWidth + 1,
      );
    }
  }

  expect(errors).toEqual([]);
});

test("Suara detail exposes localized loading and retryable missing-post state", async ({
  page,
}) => {
  await installSuaraFixtures(page, { feedDelayMs: 700 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem(
      "gys-shell-settings-v1",
      JSON.stringify({ version: 1, locale: "en", theme: "light" }),
    );
  });

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/GYSApp-Tauri/suara/missing-test-post?__gys_locale=en`);
  const detail = page.getByTestId("suara-detail-page");
  await expect(detail.locator(".loading-panel")).toBeVisible();
  await expect(detail.locator(".loading-panel")).toHaveCSS(
    "min-height",
    "290px",
  );
  // A missing post is a real detail failure: the localized status remains
  // actionable while the diagnostic message stays available for debugging.
  await expect(detail.getByRole("alert")).toBeVisible();
  await expect(
    detail.getByText(localeCopy.en.error, { exact: false }),
  ).toBeVisible();
  await expect(
    detail.getByRole("button", { name: localeCopy.en.retry }),
  ).toBeVisible();
  await detail.getByRole("button", { name: localeCopy.en.retry }).click();
  await expect(detail.getByRole("alert")).toBeVisible({ timeout: 10_000 });

  expect(errors).toEqual([]);
});
