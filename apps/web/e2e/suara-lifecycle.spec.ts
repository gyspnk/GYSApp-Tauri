import { expect, test } from "@playwright/test";

test("home paints saved Suara content before slow live revalidation", async ({
  page,
}) => {
  await page.route("**/api/v1/content/suara-sejati", async (route) => {
    // Long enough that a cached paint can never be confused with the live
    // response, even on a loaded four-core runner.
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        source: "tjc.org",
        generatedAt: "2026-08-19T00:00:00.000Z",
        items: [
          {
            id: "kesaksian-terbaru",
            title: "Kesaksian terbaru",
            excerpt: "Konten live yang sudah direvalidasi.",
            url: "https://tjc.org/id/suarasejati/kesaksian-terbaru/",
            publishedAt: "2026-08-19T00:00:00.000Z",
            source: "tjc.org",
          },
        ],
      }),
    });
  });

  await page.goto("/GYSApp-Tauri/");
  await expect(page.getByText(/Menapaki Tiga Iman Bag/i)).toBeVisible({
    // Run 41726896965 missed the 800 ms window while four workers shared the
    // runner; the contract is "cached before live", not "under 800 ms".
    timeout: 1_500,
  });
  await expect(page.getByText("Kesaksian terbaru")).toBeVisible({
    timeout: 6_000,
  });
});
