import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

const feed = {
  source: "tjc.org",
  generatedAt: "2026-09-20T00:00:00.000Z",
  items: [
    {
      id: "kesaksian-layout",
      title: "Menapaki Tiga Iman Bag",
      excerpt:
        "Dokter menyarankan operasi pengangkatan rahim dan indung telur. Cuplikan arsip resmi yang cukup panjang untuk menguji batas kartu.",
      url: "https://tjc.org/id/suarasejati/kesaksian-layout/",
      imageUrl:
        "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2023/11/27-300x166.png",
      publishedAt: "2023-12-20T00:00:00.000Z",
      source: "tjc.org",
    },
    {
      id: "cahaya-layout",
      title: "Cahaya Kehidupan",
      excerpt: "Cuplikan kesaksian kedua.",
      url: "https://tjc.org/id/suarasejati/cahaya-layout/",
      imageUrl:
        "https://tjcorguploads.s3.amazonaws.com/tjcorg/wp-content/uploads/sites/43/2023/10/DEGW8hlVoAEjaae.jpg",
      publishedAt: "2023-12-12T00:00:00.000Z",
      source: "tjc.org",
    },
  ],
};

const localeCopy = {
  id: {
    back: "← Beranda",
    title: "Suara Sejati",
    eyebrow: "Cerita dan kesaksian",
    intro: "Kesaksian nyata dari arsip resmi Gereja Yesus Sejati.",
    date: /Des/i,
    alt: "Sampul Menapaki Tiga Iman Bag",
  },
  en: {
    back: "← Home",
    title: "True Voice",
    eyebrow: "Stories and testimonies",
    intro: "True testimonies from the official True Jesus Church archive.",
    date: /Dec/i,
    alt: "Cover of Menapaki Tiga Iman Bag",
  },
  zh: {
    back: "← 主页",
    title: "真实声音",
    eyebrow: "故事与见证",
    intro: "来自真耶稣教会官方档案的真实见证。",
    date: /12月|2023年/,
    alt: "Menapaki Tiga Iman Bag 的封面",
  },
} as const;

test("Suara catalog keeps locale, image, focus, and card geometry contracts", async ({
  page,
}) => {
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({ json: feed }),
  );
  await page.route("**/api/v1/content/suara-sejati", (route) =>
    route.fulfill({ json: feed }),
  );
  await page.route(
    "https://tjcorguploads.s3.amazonaws.com/**",
    async (route) => {
      const pixelPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "cache-control": "public, max-age=604800" },
        body: pixelPng,
      });
    },
  );

  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });

  for (const locale of ["id", "en", "zh"] as const) {
    await page.addInitScript((nextLocale) => {
      localStorage.setItem(
        "gys-shell-settings-v1",
        JSON.stringify({ version: 1, locale: nextLocale, theme: "light" }),
      );
    }, locale);

    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`/GYSApp-Tauri/suara?__gys_locale=${locale}`);
      const catalog = page.getByTestId("suara-page");
      await expect(catalog).toBeVisible();
      await expect(
        page.getByRole("link", { name: localeCopy[locale].back }),
      ).toBeVisible();
      await expect(
        catalog.getByRole("heading", { name: localeCopy[locale].title }),
      ).toBeVisible();
      await expect(
        catalog.getByText(localeCopy[locale].eyebrow, { exact: true }),
      ).toBeVisible();
      await expect(
        catalog.getByText(localeCopy[locale].intro, { exact: true }),
      ).toBeVisible();

      const firstCard = catalog.locator(".suara-library-item").first();
      await expect(firstCard).toBeVisible();
      await expect(firstCard.locator(".suara-date")).toHaveText(
        localeCopy[locale].date,
      );
      await expect(firstCard.locator("img")).toHaveAttribute(
        "alt",
        localeCopy[locale].alt,
      );
      await expect
        .poll(() =>
          firstCard.locator("img").evaluate((image) => ({
            complete: image.complete,
            naturalWidth: image.naturalWidth,
          })),
        )
        .toEqual({ complete: true, naturalWidth: 1 });
      await expect(firstCard.locator("img")).toHaveAttribute(
        "src",
        /^https:\/\/tjcorguploads\.s3\.amazonaws\.com\//,
      );

      const geometry = await catalog
        .locator(".suara-library-item")
        .evaluateAll((cards) => {
          const boxes = cards.map((card) => card.getBoundingClientRect());
          return {
            heights: boxes.map((box) => box.height),
            widths: boxes.map((box) => box.width),
            scrollWidth: document.documentElement.scrollWidth,
            viewportWidth: window.innerWidth,
          };
        });
      expect(
        geometry.heights.every((height) => Math.abs(height - 290) < 1),
      ).toBe(true);
      expect(geometry.widths.every((cardWidth) => cardWidth > 0)).toBe(true);
      expect(geometry.scrollWidth).toBeLessThanOrEqual(
        geometry.viewportWidth + 1,
      );

      await firstCard.focus();
      await expect(firstCard).toBeFocused();
    }
  }

  expect(errors).toEqual([]);
});
