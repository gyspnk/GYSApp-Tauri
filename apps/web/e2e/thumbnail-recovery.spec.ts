import { expect, test } from "@playwright/test";

const artwork =
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80" fill="navy"/></svg>';

test("official thumbnail derivative recovers when the original fails", async ({
  page,
}) => {
  await page.route("**/offline/suara-sejati.json", (route) =>
    route.fulfill({
      json: {
        source: "tjc.org",
        generatedAt: "2026-10-02T00:00:00Z",
        items: [
          {
            id: "cover-test",
            title: "Sampul yang pulih",
            excerpt: "Kesaksian.",
            publishedAt: "2026-10-02T00:00:00Z",
            source: "tjc.org",
            url: "https://tjc.org/id/suara-sejati/cover-test/",
            imageUrl:
              "https://tjc.org/id/wp-content/uploads/cover-test-300x200.svg",
          },
        ],
      },
    }),
  );
  await page.route(/^https:\/\//, (route) => {
    if (route.request().url().endsWith("cover-test-300x200.svg"))
      return route.fulfill({
        body: artwork,
        contentType: "image/svg+xml",
        headers: { "cache-control": "public, max-age=3600" },
      });
    return route.abort();
  });
  for (let visit = 0; visit < 2; visit++) {
    await page.goto("/GYSApp-Tauri/suara");
    const cover = page
      .locator('.suara-library-thumb[data-image-state="loaded"]')
      .first();
    await expect(cover).toBeVisible();
    await expect(cover.locator("img")).toHaveCSS("opacity", "1");
    expect(
      await cover
        .locator("img")
        .evaluate((image) => (image as HTMLImageElement).naturalWidth),
    ).toBe(120);
    await page.goto("/GYSApp-Tauri/iman");
  }
});

test("every unavailable cover has decodable illustrated artwork", async ({
  page,
}) => {
  await page.route(/^https:\/\//, (route) => route.abort());
  await page.goto("/GYSApp-Tauri/suara");
  await expect(page.locator(".suara-library-item").first()).toBeVisible();
  const art = page.locator(".suara-library-grid .img-fallback-art");
  await expect(art.first()).toBeVisible();
  for (const image of await art.all()) {
    await expect
      .poll(() =>
        image.evaluate((element) => {
          const img = element as HTMLImageElement;
          return img.complete && img.naturalWidth > 0;
        }),
      )
      .toBe(true);
  }
});

test("failed artwork recovers when connectivity returns without a page reload", async ({
  page,
  context,
}) => {
  let reachable = false;
  await page.route(/^https:\/\//, (route) => {
    if (reachable && route.request().resourceType() === "image")
      return route.fulfill({ body: artwork, contentType: "image/svg+xml" });
    return route.abort();
  });
  await page.goto("/GYSApp-Tauri/suara");
  const cover = page.locator(".suara-library-thumb").first();
  await expect(cover).toHaveAttribute("data-image-state", "error");
  await context.setOffline(true);
  reachable = true;
  await context.setOffline(false);
  await expect(cover).toHaveAttribute("data-image-state", "loaded");
  await expect(cover.locator("img")).toHaveCSS("opacity", "1");
});
