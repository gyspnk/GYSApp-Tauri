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

  // Intercept image proxy requests to provide a valid test image
  await page.route("**/api/v1/content/image*", async (route) => {
    // Return a 1x1 transparent PNG image
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

  await page.goto("/GYSApp-Tauri/");

  // Verify home shelf contains Suara cards
  const suaraShelf = page.locator(".home-suara-shelf").first();
  await expect(suaraShelf).toBeVisible({ timeout: 10_000 });

  // Verify skeleton loading wrappers exist
  const skeletons = page.locator(".home-suara-shelf .img-skeleton-wrapper");
  await expect(skeletons.first()).toBeVisible({ timeout: 5_000 });

  // Navigate to Literatur page
  await page.goto("/GYSApp-Tauri/literatur");
  const literaturePage = page.locator(".literature-page");
  await expect(literaturePage).toBeVisible({ timeout: 10_000 });

  // Verify literature covers
  const covers = page.locator(".literature-cover");
  await expect(covers.first()).toBeVisible({ timeout: 5_000 });
});
