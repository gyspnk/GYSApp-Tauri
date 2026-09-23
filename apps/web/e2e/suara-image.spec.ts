import { expect, test } from "@playwright/test";

test.use({ serviceWorkers: "block" });

test("Suara Sejati and Literature images display loading bar and load cleanly", async ({
  page,
}) => {
  const imageRequests: string[] = [];
  page.on("request", (req) => {
    if (req.url().includes("/api/v1/content/image")) {
      imageRequests.push(req.url());
    }
  });

  // Intercept both proxy and direct official image requests to make the test
  // independent of upstream image availability.
  for (const pattern of [
    "**/api/v1/content/image*",
    "https://tjcorguploads.s3.amazonaws.com/**",
    "https://tjc.org/id/wp-content/uploads/**",
  ]) {
    await page.route(pattern, async (route) => {
      const pixelPng = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        "base64",
      );
      await route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: {
          "access-control-allow-origin": "*",
          "cache-control": "public, max-age=604800",
        },
        body: pixelPng,
      });
    });
  }

  await page.goto("/GYSApp-Tauri/");

  // Verify home shelf contains Suara cards
  const suaraShelf = page.locator(".home-suara-shelf").first();
  await expect(suaraShelf).toBeVisible({ timeout: 10_000 });

  // Verify skeleton loading wrappers exist
  const skeletons = page.locator(".home-suara-shelf .img-skeleton-wrapper");
  await expect(skeletons.first()).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(
      () =>
        page
          .locator(".home-suara-shelf .suara-thumb-img")
          .evaluateAll(
            (images) =>
              images.filter((image) => image.complete && image.naturalWidth > 0)
                .length,
          ),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0);
  await expect
    .poll(
      () =>
        page
          .locator(".home-suara-shelf .suara-thumb-img")
          .first()
          .evaluate((image) => ({
            naturalWidth: image.naturalWidth,
            opacity: getComputedStyle(image).opacity,
            visibility: getComputedStyle(image).visibility,
          })),
      { timeout: 5_000 },
    )
    .toMatchObject({ naturalWidth: 1, opacity: "1", visibility: "visible" });
  const firstSuaraImage = await page
    .locator(".home-suara-shelf .suara-thumb-img")
    .first()
    .getAttribute("src");
  expect(firstSuaraImage).toMatch(
    /^https:\/\/tjcorguploads\.s3\.amazonaws\.com\//,
  );
  expect(firstSuaraImage).not.toMatch(/-\d+x\d+\.[^/]+$/i);

  // Navigate to Literatur page
  await page.goto("/GYSApp-Tauri/literatur");
  const literaturePage = page.locator(".literature-page");
  await expect(literaturePage).toBeVisible({ timeout: 10_000 });

  // Verify literature covers
  const covers = page.locator(".literature-cover");
  await expect(covers.first()).toBeVisible({ timeout: 5_000 });
  await expect
    .poll(
      () =>
        page
          .locator(".literature-page .literature-cover img")
          .evaluateAll(
            (images) =>
              images.filter((image) => image.complete && image.naturalWidth > 0)
                .length,
          ),
      { timeout: 5_000 },
    )
    .toBeGreaterThan(0);
  const literatureSources = await page
    .locator(".literature-page .literature-cover img")
    .evaluateAll((images) => images.map((image) => image.getAttribute("src")));
  expect(literatureSources.filter(Boolean).every((src) =>
    /^https:\/\/(?:tjc\.org|www\.tjc\.org|tjcorguploads\.s3\.amazonaws\.com)\//i.test(
      src,
    ),
  )).toBe(true);
});
